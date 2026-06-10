import { AfterSaleStatus, AfterSaleType } from '../types';

export const validTransitions: Record<AfterSaleStatus, AfterSaleStatus[]> = {
  [AfterSaleStatus.PENDING_REVIEW]: [
    AfterSaleStatus.REJECTED,
    AfterSaleStatus.PENDING_RETURN,
    AfterSaleStatus.PENDING_REFUND,
    AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND,
    AfterSaleStatus.CANCELLED,
  ],
  [AfterSaleStatus.REJECTED]: [
    AfterSaleStatus.CANCELLED,
  ],
  [AfterSaleStatus.PENDING_RETURN]: [
    AfterSaleStatus.PENDING_RECEIVE,
    AfterSaleStatus.CANCELLED,
  ],
  [AfterSaleStatus.PENDING_RECEIVE]: [
    AfterSaleStatus.PENDING_REFUND,
    AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND,
    AfterSaleStatus.PENDING_DIFFERENCE,
  ],
  [AfterSaleStatus.PENDING_DIFFERENCE]: [
    AfterSaleStatus.PENDING_REFUND,
    AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND,
  ],
  [AfterSaleStatus.PENDING_REFUND]: [
    AfterSaleStatus.REFUNDING,
  ],
  [AfterSaleStatus.REFUNDING]: [
    AfterSaleStatus.REFUND_SUCCESS,
    AfterSaleStatus.REFUND_FAILED,
  ],
  [AfterSaleStatus.REFUND_FAILED]: [
    AfterSaleStatus.REFUNDING,
    AfterSaleStatus.CANCELLED,
  ],
  [AfterSaleStatus.REFUND_SUCCESS]: [
    AfterSaleStatus.COMPLETED,
  ],
  [AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND]: [
    AfterSaleStatus.EXCHANGE_OUTBOUND,
  ],
  [AfterSaleStatus.EXCHANGE_OUTBOUND]: [
    AfterSaleStatus.COMPLETED,
    AfterSaleStatus.PENDING_REFUND,
  ],
  [AfterSaleStatus.COMPLETED]: [],
  [AfterSaleStatus.CANCELLED]: [],
};

export function canTransition(from: AfterSaleStatus, to: AfterSaleStatus): boolean {
  const allowed = validTransitions[from];
  return allowed ? allowed.includes(to) : false;
}

export function getReviewTargetStatus(type: AfterSaleType): AfterSaleStatus {
  switch (type) {
    case AfterSaleType.REFUND_ONLY:
      return AfterSaleStatus.PENDING_REFUND;
    case AfterSaleType.RETURN_REFUND:
      return AfterSaleStatus.PENDING_RETURN;
    case AfterSaleType.EXCHANGE:
      return AfterSaleStatus.PENDING_RETURN;
    default:
      return AfterSaleStatus.PENDING_REFUND;
  }
}

export const statusLabels: Record<AfterSaleStatus, string> = {
  [AfterSaleStatus.PENDING_REVIEW]: '待审核',
  [AfterSaleStatus.REJECTED]: '已拒绝',
  [AfterSaleStatus.PENDING_RETURN]: '待用户退货',
  [AfterSaleStatus.PENDING_RECEIVE]: '待仓库收货',
  [AfterSaleStatus.PENDING_REFUND]: '待退款',
  [AfterSaleStatus.REFUNDING]: '退款中',
  [AfterSaleStatus.REFUND_SUCCESS]: '退款成功',
  [AfterSaleStatus.REFUND_FAILED]: '退款失败',
  [AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND]: '待换货出库',
  [AfterSaleStatus.EXCHANGE_OUTBOUND]: '换货已出库',
  [AfterSaleStatus.COMPLETED]: '已完成',
  [AfterSaleStatus.CANCELLED]: '已取消',
  [AfterSaleStatus.PENDING_DIFFERENCE]: '待差异处理',
};

export const typeLabels: Record<AfterSaleType, string> = {
  [AfterSaleType.REFUND_ONLY]: '仅退款',
  [AfterSaleType.RETURN_REFUND]: '退货退款',
  [AfterSaleType.EXCHANGE]: '换货',
};
