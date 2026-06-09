"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRefund = processRefund;
exports.retryRefund = retryRefund;
exports.getRefundByAfterSaleId = getRefundByAfterSaleId;
exports.getRefundList = getRefundList;
const uuid_1 = require("uuid");
const db_1 = require("../db");
const types_1 = require("../types");
const afterSaleService_1 = require("./afterSaleService");
function processRefund(afterSaleId, operatorId) {
    (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        const existingRefund = (0, db_1.getOne)('SELECT * FROM refund_records WHERE after_sale_order_id = ? AND status != ?', [afterSaleId, types_1.RefundStatus.FAILED]);
        if (existingRefund) {
            return;
        }
        const idempotencyKey = `refund_${afterSaleId}`;
        const idempotentRefund = (0, db_1.getOne)('SELECT * FROM refund_records WHERE idempotency_key = ?', [idempotencyKey]);
        if (idempotentRefund && idempotentRefund.status !== types_1.RefundStatus.FAILED) {
            return;
        }
        const refundId = (0, uuid_1.v4)();
        const refundNo = `RF${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        const now = new Date().toISOString();
        if (idempotentRefund && idempotentRefund.status === types_1.RefundStatus.FAILED) {
            (0, db_1.runSql)(`UPDATE refund_records 
         SET status = ?, retry_count = retry_count + 1, updated_at = ?
         WHERE idempotency_key = ?`, [types_1.RefundStatus.PROCESSING, now, idempotencyKey]);
        }
        else {
            (0, db_1.runSql)(`INSERT INTO refund_records (
          id, refund_no, after_sale_order_id, order_id, user_id, amount,
          status, idempotency_key, retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`, [
                refundId, refundNo, afterSaleId, afterSale.order_id, afterSale.user_id,
                afterSale.actual_refund_amount, types_1.RefundStatus.PROCESSING, idempotencyKey, now, now
            ]);
        }
        (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?', [types_1.AfterSaleStatus.REFUNDING, now, afterSaleId]);
        (0, afterSaleService_1.addAfterSaleLog)(afterSaleId, operatorId, types_1.UserRole.FINANCE_STAFF, '发起退款', types_1.AfterSaleStatus.PENDING_REFUND, types_1.AfterSaleStatus.REFUNDING, `退款金额: ¥${afterSale.actual_refund_amount}`);
        try {
            const success = executeRefundPayment(afterSale.actual_refund_amount);
            if (success) {
                (0, db_1.runSql)(`UPDATE refund_records 
           SET status = ?, paid_at = ?, updated_at = ?
           WHERE after_sale_order_id = ? AND status = ?`, [types_1.RefundStatus.SUCCESS, now, now, afterSaleId, types_1.RefundStatus.PROCESSING]);
                (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?', [types_1.AfterSaleStatus.REFUND_SUCCESS, now, afterSaleId]);
                (0, afterSaleService_1.addAfterSaleLog)(afterSaleId, operatorId, types_1.UserRole.FINANCE_STAFF, '退款成功', types_1.AfterSaleStatus.REFUNDING, types_1.AfterSaleStatus.REFUND_SUCCESS, `退款金额: ¥${afterSale.actual_refund_amount}`);
                const order = (0, db_1.getOne)('SELECT * FROM orders WHERE id = ?', [afterSale.order_id]);
                if (order && order.coupon_id) {
                    (0, db_1.runSql)(`UPDATE coupons SET status = 'refunded', refunded_at = ?, order_id = NULL 
             WHERE id = ? AND status = 'used'`, [now, order.coupon_id]);
                }
            }
            else {
                throw new Error('支付网关退款失败');
            }
        }
        catch (err) {
            (0, db_1.runSql)(`UPDATE refund_records 
         SET status = ?, failure_reason = ?, updated_at = ?
         WHERE after_sale_order_id = ? AND status = ?`, [types_1.RefundStatus.FAILED, err.message || '退款失败', now, afterSaleId, types_1.RefundStatus.PROCESSING]);
            (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?', [types_1.AfterSaleStatus.REFUND_FAILED, now, afterSaleId]);
            (0, afterSaleService_1.addAfterSaleLog)(afterSaleId, operatorId, types_1.UserRole.FINANCE_STAFF, '退款失败', types_1.AfterSaleStatus.REFUNDING, types_1.AfterSaleStatus.REFUND_FAILED, `失败原因: ${err.message || '退款失败'}`);
        }
    });
}
function retryRefund(afterSaleId, operatorId, operatorRole) {
    const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
    if (!afterSale) {
        throw new Error('售后单不存在');
    }
    if (afterSale.status !== types_1.AfterSaleStatus.REFUND_FAILED) {
        throw new Error('当前状态不支持重试退款');
    }
    processRefund(afterSaleId, operatorId);
}
function executeRefundPayment(amount) {
    if (amount <= 0) {
        return false;
    }
    return true;
}
function getRefundByAfterSaleId(afterSaleId) {
    return (0, db_1.getOne)('SELECT * FROM refund_records WHERE after_sale_order_id = ? ORDER BY created_at DESC LIMIT 1', [afterSaleId]);
}
function getRefundList(status) {
    let sql = 'SELECT * FROM refund_records WHERE 1=1';
    const params = [];
    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    return (0, db_1.getAll)(sql, params);
}
//# sourceMappingURL=refundService.js.map