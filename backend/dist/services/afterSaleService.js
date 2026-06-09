"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryRefund = exports.processRefund = void 0;
exports.createAfterSale = createAfterSale;
exports.reviewAfterSale = reviewAfterSale;
exports.submitReturnLogistics = submitReturnLogistics;
exports.confirmReturnReceive = confirmReturnReceive;
exports.handleDifference = handleDifference;
exports.processExchangeOutbound = processExchangeOutbound;
exports.convertExchangeToRefund = convertExchangeToRefund;
exports.cancelAfterSale = cancelAfterSale;
exports.completeAfterSale = completeAfterSale;
exports.addAfterSaleLog = addAfterSaleLog;
exports.getAfterSaleById = getAfterSaleById;
exports.getAfterSaleList = getAfterSaleList;
const uuid_1 = require("uuid");
const db_1 = require("../db");
const types_1 = require("../types");
const stateMachine_1 = require("./stateMachine");
const refundService_1 = require("./refundService");
Object.defineProperty(exports, "processRefund", { enumerable: true, get: function () { return refundService_1.processRefund; } });
Object.defineProperty(exports, "retryRefund", { enumerable: true, get: function () { return refundService_1.retryRefund; } });
const inventoryService_1 = require("./inventoryService");
function createAfterSale(userId, orderId, type, reason, images, items) {
    return (0, db_1.withTransaction)(() => {
        const order = (0, db_1.getOne)('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) {
            throw new Error('订单不存在');
        }
        if (order.user_id !== userId) {
            throw new Error('无权对该订单发起售后');
        }
        if (order.status === types_1.OrderStatus.CANCELLED || order.status === types_1.OrderStatus.PENDING_PAYMENT) {
            throw new Error('该订单状态不支持售后');
        }
        if (type === types_1.AfterSaleType.REFUND_ONLY &&
            order.status !== types_1.OrderStatus.COMPLETED &&
            order.status !== types_1.OrderStatus.DELIVERED &&
            order.status !== types_1.OrderStatus.SHIPPED) {
            throw new Error('仅退款支持已发货、已收货、已完成的订单');
        }
        if ((type === types_1.AfterSaleType.RETURN_REFUND || type === types_1.AfterSaleType.EXCHANGE) &&
            order.status !== types_1.OrderStatus.COMPLETED &&
            order.status !== types_1.OrderStatus.DELIVERED) {
            throw new Error('退货退款和换货支持已收货、已完成的订单');
        }
        const orderItems = (0, db_1.getAll)('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
        if (orderItems.length === 0) {
            throw new Error('订单无商品明细');
        }
        const productFirst = (0, db_1.getOne)('SELECT warehouse_id as warehouseId FROM products WHERE id = ?', [orderItems[0].product_id]);
        const warehouseId = productFirst?.warehouseId;
        if (!warehouseId) {
            throw new Error('无法确定仓库');
        }
        const afterSaleOrderId = (0, uuid_1.v4)();
        const afterSaleNo = `AS${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        const now = new Date().toISOString();
        let totalApplyAmount = 0;
        const afterSaleItems = [];
        for (const item of items) {
            const orderItem = orderItems.find((oi) => oi.id === item.orderItemId);
            if (!orderItem) {
                throw new Error('订单商品不存在');
            }
            const availableQty = orderItem.available_refund_quantity - orderItem.frozen_refund_quantity;
            if (item.quantity > availableQty) {
                throw new Error(`商品 ${orderItem.product_name} 可售后数量不足，剩余可售后 ${availableQty} 件`);
            }
            if (item.quantity <= 0) {
                throw new Error('售后数量必须大于0');
            }
            const itemAmount = orderItem.unit_price * item.quantity;
            totalApplyAmount += itemAmount;
            afterSaleItems.push({
                id: (0, uuid_1.v4)(),
                afterSaleOrderId,
                orderItemId: item.orderItemId,
                productId: orderItem.product_id,
                productName: orderItem.product_name,
                productSku: orderItem.product_sku,
                applyQuantity: item.quantity,
                unitPrice: orderItem.unit_price,
                applyAmount: itemAmount,
            });
            (0, db_1.runSql)('UPDATE order_items SET frozen_refund_quantity = frozen_refund_quantity + ? WHERE id = ?', [item.quantity, item.orderItemId]);
        }
        const discountRatio = order.pay_amount / order.total_amount;
        const actualApplyAmount = totalApplyAmount * discountRatio;
        (0, db_1.runSql)(`INSERT INTO after_sale_orders (
        id, after_sale_no, order_id, user_id, type, status, reason, images,
        apply_amount, actual_refund_amount, warehouse_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            afterSaleOrderId, afterSaleNo, orderId, userId, type, types_1.AfterSaleStatus.PENDING_REVIEW,
            reason, images || null, totalApplyAmount, actualApplyAmount, warehouseId, now, now
        ]);
        for (const item of afterSaleItems) {
            (0, db_1.runSql)(`INSERT INTO after_sale_items (
          id, after_sale_order_id, order_item_id, product_id, product_name, product_sku,
          apply_quantity, actual_quantity, unit_price, apply_amount, actual_refund_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?)`, [
                item.id, item.afterSaleOrderId, item.orderItemId, item.productId,
                item.productName, item.productSku, item.applyQuantity, item.unitPrice,
                item.applyAmount, now
            ]);
        }
        addAfterSaleLog(afterSaleOrderId, userId, types_1.UserRole.CUSTOMER, '提交售后申请', undefined, types_1.AfterSaleStatus.PENDING_REVIEW, `售后类型: ${type}, 原因: ${reason}`);
        return getAfterSaleById(afterSaleOrderId);
    });
}
function reviewAfterSale(afterSaleId, reviewerId, reviewerRole, approved, rejectReason) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.PENDING_REVIEW) {
            throw new Error('该售后单状态不支持审核');
        }
        const now = new Date().toISOString();
        if (!approved) {
            if (!rejectReason || rejectReason.trim().length === 0) {
                throw new Error('审核拒绝必须填写原因');
            }
            unfreezeOrderItems(afterSaleId);
            (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, reject_reason = ?, reviewer_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?', [types_1.AfterSaleStatus.REJECTED, rejectReason, reviewerId, now, now, afterSaleId]);
            addAfterSaleLog(afterSaleId, reviewerId, reviewerRole, '审核拒绝', types_1.AfterSaleStatus.PENDING_REVIEW, types_1.AfterSaleStatus.REJECTED, `拒绝原因: ${rejectReason}`);
            return getAfterSaleById(afterSaleId);
        }
        const targetStatus = (0, stateMachine_1.getReviewTargetStatus)(afterSale.type);
        if (!(0, stateMachine_1.canTransition)(types_1.AfterSaleStatus.PENDING_REVIEW, targetStatus)) {
            throw new Error('状态流转不合法');
        }
        (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, reviewer_id = ?, reviewed_at = ?, updated_at = ? WHERE id = ?', [targetStatus, reviewerId, now, now, afterSaleId]);
        addAfterSaleLog(afterSaleId, reviewerId, reviewerRole, '审核通过', types_1.AfterSaleStatus.PENDING_REVIEW, targetStatus, '售后审核通过');
        if (targetStatus === types_1.AfterSaleStatus.PENDING_REFUND) {
            (0, refundService_1.processRefund)(afterSaleId, reviewerId);
        }
        return getAfterSaleById(afterSaleId);
    });
}
function submitReturnLogistics(afterSaleId, userId, logisticsNo, logisticsCompany) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (afterSale.user_id !== userId) {
            throw new Error('无权操作该售后单');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.PENDING_USER_RETURN) {
            throw new Error('当前状态不支持填写退货物流');
        }
        const now = new Date().toISOString();
        (0, db_1.runSql)(`UPDATE after_sale_orders 
       SET status = ?, return_logistics_no = ?, return_logistics_company = ?, updated_at = ?
       WHERE id = ?`, [types_1.AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE, logisticsNo, logisticsCompany, now, afterSaleId]);
        addAfterSaleLog(afterSaleId, userId, types_1.UserRole.CUSTOMER, '填写退货物流', types_1.AfterSaleStatus.PENDING_USER_RETURN, types_1.AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE, `物流公司: ${logisticsCompany}, 物流单号: ${logisticsNo}`);
        return getAfterSaleById(afterSaleId);
    });
}
function confirmReturnReceive(afterSaleId, operatorId, operatorRole, warehouseId, receivedItems) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE) {
            throw new Error('当前状态不支持确认收货');
        }
        if (afterSale.warehouse_id !== warehouseId) {
            throw new Error('无权操作其他仓库的售后单');
        }
        const afterSaleItems = (0, db_1.getAll)('SELECT * FROM after_sale_items WHERE after_sale_order_id = ?', [afterSaleId]);
        let hasDifference = false;
        for (const received of receivedItems) {
            const item = afterSaleItems.find((i) => i.id === received.afterSaleItemId);
            if (!item) {
                throw new Error('售后商品不存在');
            }
            if (received.actualQuantity < 0 || received.actualQuantity > item.apply_quantity) {
                throw new Error('实收数量不能为负，也不能超过申请数量');
            }
            if (received.actualQuantity !== item.apply_quantity) {
                hasDifference = true;
            }
            if (received.actualQuantity > 0) {
                (0, inventoryService_1.returnInbound)(item.product_id, warehouseId, received.actualQuantity, 'after_sale_return', afterSaleId, operatorId);
            }
            const actualRefundAmount = item.unit_price * received.actualQuantity;
            (0, db_1.runSql)(`UPDATE after_sale_items 
         SET actual_quantity = ?, actual_refund_amount = ?
         WHERE id = ?`, [received.actualQuantity, actualRefundAmount, received.afterSaleItemId]);
            const orderItem = (0, db_1.getOne)('SELECT * FROM order_items WHERE id = ?', [item.order_item_id]);
            if (orderItem) {
                (0, db_1.runSql)('UPDATE order_items SET refunded_quantity = refunded_quantity + ?, frozen_refund_quantity = frozen_refund_quantity - ?, available_refund_quantity = available_refund_quantity - ? WHERE id = ?', [received.actualQuantity, item.apply_quantity, received.actualQuantity, item.order_item_id]);
                const unreturnedQty = item.apply_quantity - received.actualQuantity;
                if (unreturnedQty > 0) {
                    (0, db_1.runSql)('UPDATE order_items SET frozen_refund_quantity = frozen_refund_quantity - ? WHERE id = ?', [unreturnedQty, item.order_item_id]);
                }
            }
            if (received.actualQuantity !== item.apply_quantity) {
                const diffId = (0, uuid_1.v4)();
                const now = new Date().toISOString();
                (0, db_1.runSql)(`INSERT INTO difference_records (
            id, after_sale_order_id, after_sale_item_id, apply_quantity, actual_quantity,
            difference, reason, handled, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`, [
                    diffId, afterSaleId, received.afterSaleItemId,
                    item.apply_quantity, received.actualQuantity,
                    item.apply_quantity - received.actualQuantity,
                    null, now
                ]);
            }
        }
        const totalActualRefund = afterSaleItems.reduce((sum, item) => {
            const received = receivedItems.find(r => r.afterSaleItemId === item.id);
            return sum + (received ? item.unit_price * received.actualQuantity : 0);
        }, 0);
        const order = (0, db_1.getOne)('SELECT * FROM orders WHERE id = ?', [afterSale.order_id]);
        const discountRatio = order ? order.pay_amount / order.total_amount : 1;
        const actualRefundWithDiscount = totalActualRefund * discountRatio;
        let nextStatus;
        if (hasDifference) {
            nextStatus = types_1.AfterSaleStatus.PENDING_DIFFERENCE_HANDLING;
        }
        else if (afterSale.type === types_1.AfterSaleType.EXCHANGE) {
            nextStatus = types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND;
        }
        else {
            nextStatus = types_1.AfterSaleStatus.PENDING_REFUND;
        }
        const now = new Date().toISOString();
        (0, db_1.runSql)(`UPDATE after_sale_orders 
       SET status = ?, actual_refund_amount = ?, updated_at = ?
       WHERE id = ?`, [nextStatus, actualRefundWithDiscount, now, afterSaleId]);
        addAfterSaleLog(afterSaleId, operatorId, operatorRole, '确认收货入库', afterSale.status, nextStatus, hasDifference ? '收货数量有差异，进入差异处理' : '收货完成');
        if (nextStatus === types_1.AfterSaleStatus.PENDING_REFUND) {
            (0, refundService_1.processRefund)(afterSaleId, operatorId);
        }
        return getAfterSaleById(afterSaleId);
    });
}
function handleDifference(afterSaleId, handlerId, handlerRole, differenceItemIds, action) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.PENDING_DIFFERENCE_HANDLING) {
            throw new Error('当前状态不支持差异处理');
        }
        const now = new Date().toISOString();
        for (const diffId of differenceItemIds) {
            (0, db_1.runSql)('UPDATE difference_records SET handled = 1, handler_id = ?, handled_at = ?, reason = ? WHERE id = ? AND after_sale_order_id = ?', [handlerId, now, action === 'refund_actual' ? '按实际数量退款' : '取消差异部分', diffId, afterSaleId]);
        }
        const allDiffs = (0, db_1.getAll)('SELECT * FROM difference_records WHERE after_sale_order_id = ?', [afterSaleId]);
        const allHandled = allDiffs.every((d) => d.handled === 1);
        let nextStatus;
        if (allHandled) {
            if (afterSale.type === types_1.AfterSaleType.EXCHANGE) {
                nextStatus = types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND;
            }
            else {
                nextStatus = types_1.AfterSaleStatus.PENDING_REFUND;
            }
            (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, difference_handled = 1, updated_at = ? WHERE id = ?', [nextStatus, now, afterSaleId]);
            addAfterSaleLog(afterSaleId, handlerId, handlerRole, '差异处理完成', types_1.AfterSaleStatus.PENDING_DIFFERENCE_HANDLING, nextStatus, `处理方式: ${action === 'refund_actual' ? '按实际数量退款' : '取消差异部分'}`);
            if (nextStatus === types_1.AfterSaleStatus.PENDING_REFUND) {
                (0, refundService_1.processRefund)(afterSaleId, handlerId);
            }
        }
        else {
            (0, db_1.runSql)('UPDATE after_sale_orders SET updated_at = ? WHERE id = ?', [now, afterSaleId]);
            addAfterSaleLog(afterSaleId, handlerId, handlerRole, '部分差异处理', types_1.AfterSaleStatus.PENDING_DIFFERENCE_HANDLING, undefined, '部分差异已处理');
        }
        return getAfterSaleById(afterSaleId);
    });
}
function processExchangeOutbound(afterSaleId, operatorId, operatorRole, warehouseId, exchangeProductId, logisticsNo, logisticsCompany) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND) {
            throw new Error('当前状态不支持换货出库');
        }
        if (afterSale.warehouse_id !== warehouseId) {
            throw new Error('无权操作其他仓库的售后单');
        }
        const afterSaleItems = (0, db_1.getAll)('SELECT * FROM after_sale_items WHERE after_sale_order_id = ?', [afterSaleId]);
        const totalQty = afterSaleItems.reduce((sum, item) => sum + item.actual_quantity, 0);
        (0, inventoryService_1.exchangeOutbound)(exchangeProductId, warehouseId, totalQty, 'after_sale_exchange', afterSaleId, operatorId);
        const now = new Date().toISOString();
        (0, db_1.runSql)(`UPDATE after_sale_orders 
       SET status = ?, exchange_product_id = ?, exchange_logistics_no = ?, 
           exchange_logistics_company = ?, updated_at = ?
       WHERE id = ?`, [types_1.AfterSaleStatus.EXCHANGE_SHIPPED, exchangeProductId, logisticsNo, logisticsCompany, now, afterSaleId]);
        addAfterSaleLog(afterSaleId, operatorId, operatorRole, '换货出库', types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND, types_1.AfterSaleStatus.EXCHANGE_SHIPPED, `换货商品: ${exchangeProductId}, 物流: ${logisticsCompany} - ${logisticsNo}`);
        return getAfterSaleById(afterSaleId);
    });
}
function convertExchangeToRefund(afterSaleId, operatorId, operatorRole) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.EXCHANGE_SHIPPED &&
            afterSale.status !== types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND) {
            throw new Error('当前状态不支持转退款');
        }
        const now = new Date().toISOString();
        const fromStatus = afterSale.status;
        (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, type = ?, updated_at = ? WHERE id = ?', [types_1.AfterSaleStatus.PENDING_REFUND, types_1.AfterSaleType.RETURN_REFUND, now, afterSaleId]);
        addAfterSaleLog(afterSaleId, operatorId, operatorRole, '换货转退款', fromStatus, types_1.AfterSaleStatus.PENDING_REFUND, '换货失败，转为退款处理');
        (0, refundService_1.processRefund)(afterSaleId, operatorId);
        return getAfterSaleById(afterSaleId);
    });
}
function cancelAfterSale(afterSaleId, operatorId, operatorRole) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (operatorRole === types_1.UserRole.CUSTOMER && afterSale.user_id !== operatorId) {
            throw new Error('无权取消该售后单');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.PENDING_REVIEW &&
            afterSale.status !== types_1.AfterSaleStatus.REJECTED &&
            afterSale.status !== types_1.AfterSaleStatus.PENDING_USER_RETURN) {
            throw new Error('当前状态不支持取消');
        }
        const fromStatus = afterSale.status;
        const now = new Date().toISOString();
        if (fromStatus === types_1.AfterSaleStatus.PENDING_REVIEW || fromStatus === types_1.AfterSaleStatus.PENDING_USER_RETURN) {
            unfreezeOrderItems(afterSaleId);
        }
        (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?', [types_1.AfterSaleStatus.CANCELLED, now, afterSaleId]);
        addAfterSaleLog(afterSaleId, operatorId, operatorRole, '取消售后', fromStatus, types_1.AfterSaleStatus.CANCELLED, '售后单已取消');
        return getAfterSaleById(afterSaleId);
    });
}
function completeAfterSale(afterSaleId, operatorId, operatorRole) {
    return (0, db_1.withTransaction)(() => {
        const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [afterSaleId]);
        if (!afterSale) {
            throw new Error('售后单不存在');
        }
        if (afterSale.status !== types_1.AfterSaleStatus.REFUND_SUCCESS &&
            afterSale.status !== types_1.AfterSaleStatus.EXCHANGE_SHIPPED) {
            throw new Error('当前状态不支持完成');
        }
        const fromStatus = afterSale.status;
        const now = new Date().toISOString();
        (0, db_1.runSql)('UPDATE after_sale_orders SET status = ?, updated_at = ? WHERE id = ?', [types_1.AfterSaleStatus.COMPLETED, now, afterSaleId]);
        addAfterSaleLog(afterSaleId, operatorId, operatorRole, '售后完成', fromStatus, types_1.AfterSaleStatus.COMPLETED, '售后单已完成');
        return getAfterSaleById(afterSaleId);
    });
}
function unfreezeOrderItems(afterSaleId) {
    const items = (0, db_1.getAll)('SELECT * FROM after_sale_items WHERE after_sale_order_id = ?', [afterSaleId]);
    for (const item of items) {
        (0, db_1.runSql)('UPDATE order_items SET frozen_refund_quantity = frozen_refund_quantity - ? WHERE id = ?', [item.apply_quantity, item.order_item_id]);
    }
}
function addAfterSaleLog(afterSaleOrderId, operatorId, operatorRole, action, fromStatus, toStatus, remark) {
    const logId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    (0, db_1.runSql)(`INSERT INTO after_sale_logs (
      id, after_sale_order_id, operator_id, operator_role, action,
      from_status, to_status, remark, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [logId, afterSaleOrderId, operatorId, operatorRole, action, fromStatus || null, toStatus || null, remark || null, now]);
}
function getAfterSaleById(id) {
    const afterSale = (0, db_1.getOne)('SELECT * FROM after_sale_orders WHERE id = ?', [id]);
    if (!afterSale) {
        throw new Error('售后单不存在');
    }
    const items = (0, db_1.getAll)('SELECT * FROM after_sale_items WHERE after_sale_order_id = ? ORDER BY created_at', [id]);
    const logs = (0, db_1.getAll)('SELECT * FROM after_sale_logs WHERE after_sale_order_id = ? ORDER BY created_at DESC', [id]);
    const refundRecords = (0, db_1.getAll)('SELECT * FROM refund_records WHERE after_sale_order_id = ? ORDER BY created_at DESC', [id]);
    const differenceRecords = (0, db_1.getAll)('SELECT * FROM difference_records WHERE after_sale_order_id = ? ORDER BY created_at', [id]);
    return {
        ...afterSale,
        items,
        logs,
        refundRecords,
        differenceRecords,
    };
}
function getAfterSaleList(userId, userRole, warehouseId, status, type) {
    let sql = `SELECT a.*, o.order_no as orderNo 
             FROM after_sale_orders a 
             LEFT JOIN orders o ON a.order_id = o.id
             WHERE 1=1`;
    const params = [];
    if (userRole === types_1.UserRole.CUSTOMER && userId) {
        sql += ' AND a.user_id = ?';
        params.push(userId);
    }
    if (userRole === types_1.UserRole.WAREHOUSE_STAFF && warehouseId) {
        sql += ' AND a.warehouse_id = ?';
        params.push(warehouseId);
    }
    if (status) {
        sql += ' AND a.status = ?';
        params.push(status);
    }
    if (type) {
        sql += ' AND a.type = ?';
        params.push(type);
    }
    sql += ' ORDER BY a.created_at DESC';
    return (0, db_1.getAll)(sql, params);
}
//# sourceMappingURL=afterSaleService.js.map