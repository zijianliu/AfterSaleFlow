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
          afterSale.actual_refund_amount, RefundStatus.PROCESSING, idempotencyKey, now, now
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
      `退款金额: ¥${afterSale.actual_refund_amount}`
    );

    try {
      const success = executeRefundPayment(afterSale.actual_refund_amount);

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

        addAfterSaleLog(
          afterSaleId, operatorId, UserRole.FINANCE_STAFF,
          '退款成功', AfterSaleStatus.REFUNDING, AfterSaleStatus.REFUND_SUCCESS,
          `退款金额: ¥${afterSale.actual_refund_amount}`
        );

        const order = getOne<any>('SELECT * FROM orders WHERE id = ?', [afterSale.order_id]);
        if (order && order.coupon_id) {
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
