import { v4 as uuidv4 } from 'uuid';
import { runSql, getOne, getAll, withTransaction } from '../db';
import { RefundStatus, AfterSaleStatus, UserRole } from '../types';
import { addAfterSaleLog } from './afterSaleService';

export function processRefund(
  afterSaleId: string,
  operatorId: string
): void {
  withTransaction(() => {
    const afterSale = getOne<any>('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
    if (!afterSale) {
      throw new Error('售后单不存在');
    }

    const order = getOne<any>('SELECT * FROM orders WHERE id = ?', [afterSale.order_id]);
    if (!order) {
      throw new Error('订单不存在');
    }

    const refundAmount = Number(afterSale.actual_refund_amount);
    if (refundAmount <= 0) {
      throw new Error('退款金额必须大于0');
    }

    const totalRefunded = Number(order.refunded_amount || 0);
    if (totalRefunded + refundAmount > Number(order.pay_amount) + 0.01) {
      throw new Error(`累计退款金额(${formatMoney(totalRefunded + refundAmount)})不能超过订单实付金额(${formatMoney(order.pay_amount)})`);
    }

    const existingRefund = getOne<any>(
      'SELECT * FROM refund_records WHERE after_sale_order_id = ? AND status != ?',
      [afterSaleId, RefundStatus.FAILED]
    );

    if (existingRefund) {
      return;
    }

    const idempotencyKey = `refund_${afterSaleId}`;

    const idempotentRefund = getOne<any>(
      'SELECT * FROM refund_records WHERE idempotency_key = ?',
      [idempotencyKey]
    );

    if (idempotentRefund && idempotentRefund.status !== RefundStatus.FAILED) {
      return;
    }

    const refundId = uuidv4();
    const refundNo = `RF${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const now = new Date().toISOString();

    if (idempotentRefund && idempotentRefund.status === RefundStatus.FAILED) {
      runSql(
        `UPDATE refund_records 
         SET status = ?, retry_count = retry_count + 1, updated_at = ?
         WHERE idempotency_key = ?`,
        [RefundStatus.PROCESSING, now, idempotencyKey]
      );
    } else {
      runSql(
        `INSERT INTO refund_records (
          id, refund_no, after_sale_order_id, order_id, user_id, amount,
          status, idempotency_key, retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          refundId, refundNo, afterSaleId, afterSale.order_id, afterSale.user_id,
          refundAmount, RefundStatus.PROCESSING, idempotencyKey, now, now
        ]
      );
    }

    runSql(
      'UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?',
      [AfterSaleStatus.REFUNDING, now, afterSaleId]
    );

    addAfterSaleLog(
      afterSaleId, operatorId, UserRole.FINANCE_STAFF,
      '发起退款', AfterSaleStatus.PENDING_REFUND, AfterSaleStatus.REFUNDING,
      `退款金额: ¥${refundAmount.toFixed(2)}`
    );

    try {
      const success = executeRefundPayment(refundAmount);

      if (success) {
        runSql(
          `UPDATE refund_records 
           SET status = ?, paid_at = ?, updated_at = ?
           WHERE after_sale_order_id = ? AND status = ?`,
          [RefundStatus.SUCCESS, now, now, afterSaleId, RefundStatus.PROCESSING]
        );

        runSql(
          'UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?',
          [AfterSaleStatus.REFUND_SUCCESS, now, afterSaleId]
        );

        runSql(
          'UPDATE orders SET refunded_amount = refunded_amount + ?, updated_at = ? WHERE id = ?',
          [refundAmount, now, afterSale.order_id]
        );

        const afterSaleItems = getAll<any>(
          'SELECT * FROM after_sale_items WHERE after_sale_order_id = ?',
          [afterSaleId]
        );

        const discountRatio = Number(order.pay_amount) / Number(order.total_amount);

        for (const item of afterSaleItems) {
          const itemRefundAmount = Number(item.actual_quantity) * Number(item.unit_price) * discountRatio;
          if (itemRefundAmount > 0) {
            runSql(
              'UPDATE order_items SET refunded_amount = refunded_amount + ? WHERE id = ?',
              [itemRefundAmount, item.order_item_id]
            );
          }
        }

        addAfterSaleLog(
          afterSaleId, operatorId, UserRole.FINANCE_STAFF,
          '退款成功', AfterSaleStatus.REFUNDING, AfterSaleStatus.REFUND_SUCCESS,
          `退款金额: ¥${refundAmount.toFixed(2)}`
        );

        if (order.coupon_id) {
          runSql(
            `UPDATE coupons SET status = 'refunded', refunded_at = ?, order_id = NULL 
             WHERE id = ? AND status = 'used'`,
            [now, order.coupon_id]
          );
        }
      } else {
        throw new Error('支付网关退款失败');
      }
    } catch (err: any) {
      runSql(
        `UPDATE refund_records 
         SET status = ?, failure_reason = ?, updated_at = ?
         WHERE after_sale_order_id = ? AND status = ?`,
        [RefundStatus.FAILED, err.message || '退款失败', now, afterSaleId, RefundStatus.PROCESSING]
      );

      runSql(
        'UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?',
        [AfterSaleStatus.REFUND_FAILED, now, afterSaleId]
      );

      addAfterSaleLog(
        afterSaleId, operatorId, UserRole.FINANCE_STAFF,
        '退款失败', AfterSaleStatus.REFUNDING, AfterSaleStatus.REFUND_FAILED,
        `失败原因: ${err.message || '退款失败'}`
      );
    }
  });
}

export function retryRefund(
  afterSaleId: string,
  operatorId: string,
  operatorRole: UserRole
): void {
  const afterSale = getOne<any>('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
  if (!afterSale) {
    throw new Error('售后单不存在');
  }

  if (afterSale.status !== AfterSaleStatus.REFUND_FAILED) {
    throw new Error('当前状态不支持重试退款');
  }

  processRefund(afterSaleId, operatorId);
}

function executeRefundPayment(amount: number): boolean {
  if (amount <= 0) {
    return false;
  }
  
  return true;
}

function formatMoney(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export function getRefundByAfterSaleId(afterSaleId: string): any | null {
  return getOne<any>(
    'SELECT * FROM refund_records WHERE after_sale_order_id = ? ORDER BY created_at DESC LIMIT 1',
    [afterSaleId]
  );
}

export function getRefundList(status?: RefundStatus): any[] {
  let sql = 'SELECT * FROM refund_records WHERE 1=1';
  const params: any[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  return getAll<any>(sql, params);
}
