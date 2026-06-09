"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeLabels = exports.statusLabels = exports.validTransitions = void 0;
exports.canTransition = canTransition;
exports.getReviewTargetStatus = getReviewTargetStatus;
const types_1 = require("../types");
exports.validTransitions = {
    [types_1.AfterSaleStatus.PENDING_REVIEW]: [
        types_1.AfterSaleStatus.REJECTED,
        types_1.AfterSaleStatus.PENDING_USER_RETURN,
        types_1.AfterSaleStatus.PENDING_REFUND,
        types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND,
        types_1.AfterSaleStatus.CANCELLED,
    ],
    [types_1.AfterSaleStatus.REJECTED]: [
        types_1.AfterSaleStatus.CANCELLED,
    ],
    [types_1.AfterSaleStatus.PENDING_USER_RETURN]: [
        types_1.AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE,
        types_1.AfterSaleStatus.CANCELLED,
    ],
    [types_1.AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE]: [
        types_1.AfterSaleStatus.PENDING_REFUND,
        types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND,
        types_1.AfterSaleStatus.PENDING_DIFFERENCE_HANDLING,
    ],
    [types_1.AfterSaleStatus.PENDING_DIFFERENCE_HANDLING]: [
        types_1.AfterSaleStatus.PENDING_REFUND,
        types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND,
    ],
    [types_1.AfterSaleStatus.PENDING_REFUND]: [
        types_1.AfterSaleStatus.REFUNDING,
    ],
    [types_1.AfterSaleStatus.REFUNDING]: [
        types_1.AfterSaleStatus.REFUND_SUCCESS,
        types_1.AfterSaleStatus.REFUND_FAILED,
    ],
    [types_1.AfterSaleStatus.REFUND_FAILED]: [
        types_1.AfterSaleStatus.REFUNDING,
        types_1.AfterSaleStatus.CANCELLED,
    ],
    [types_1.AfterSaleStatus.REFUND_SUCCESS]: [
        types_1.AfterSaleStatus.COMPLETED,
    ],
    [types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND]: [
        types_1.AfterSaleStatus.EXCHANGE_SHIPPED,
    ],
    [types_1.AfterSaleStatus.EXCHANGE_SHIPPED]: [
        types_1.AfterSaleStatus.COMPLETED,
        types_1.AfterSaleStatus.PENDING_REFUND,
    ],
    [types_1.AfterSaleStatus.COMPLETED]: [],
    [types_1.AfterSaleStatus.CANCELLED]: [],
};
function canTransition(from, to) {
    const allowed = exports.validTransitions[from];
    return allowed ? allowed.includes(to) : false;
}
function getReviewTargetStatus(type) {
    switch (type) {
        case types_1.AfterSaleType.REFUND_ONLY:
            return types_1.AfterSaleStatus.PENDING_REFUND;
        case types_1.AfterSaleType.RETURN_REFUND:
            return types_1.AfterSaleStatus.PENDING_USER_RETURN;
        case types_1.AfterSaleType.EXCHANGE:
            return types_1.AfterSaleStatus.PENDING_USER_RETURN;
        default:
            return types_1.AfterSaleStatus.PENDING_REFUND;
    }
}
exports.statusLabels = {
    [types_1.AfterSaleStatus.PENDING_REVIEW]: '待审核',
    [types_1.AfterSaleStatus.REJECTED]: '已拒绝',
    [types_1.AfterSaleStatus.PENDING_USER_RETURN]: '待用户退货',
    [types_1.AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE]: '待仓库收货',
    [types_1.AfterSaleStatus.PENDING_REFUND]: '待退款',
    [types_1.AfterSaleStatus.REFUNDING]: '退款中',
    [types_1.AfterSaleStatus.REFUND_SUCCESS]: '退款成功',
    [types_1.AfterSaleStatus.REFUND_FAILED]: '退款失败',
    [types_1.AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND]: '待换货出库',
    [types_1.AfterSaleStatus.EXCHANGE_SHIPPED]: '换货已出库',
    [types_1.AfterSaleStatus.COMPLETED]: '已完成',
    [types_1.AfterSaleStatus.CANCELLED]: '已取消',
    [types_1.AfterSaleStatus.PENDING_DIFFERENCE_HANDLING]: '待差异处理',
};
exports.typeLabels = {
    [types_1.AfterSaleType.REFUND_ONLY]: '仅退款',
    [types_1.AfterSaleType.RETURN_REFUND]: '退货退款',
    [types_1.AfterSaleType.EXCHANGE]: '换货',
};
//# sourceMappingURL=stateMachine.js.map