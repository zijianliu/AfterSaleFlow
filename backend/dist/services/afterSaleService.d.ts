import { AfterSaleStatus, AfterSaleType, AfterSaleOrder, UserRole } from '../types';
import { processRefund, retryRefund } from './refundService';
export declare function createAfterSale(userId: string, orderId: string, type: AfterSaleType, reason: string, images: string | undefined, items: {
    orderItemId: string;
    quantity: number;
}[]): AfterSaleOrder;
export declare function reviewAfterSale(afterSaleId: string, reviewerId: string, reviewerRole: UserRole, approved: boolean, rejectReason?: string): AfterSaleOrder;
export declare function submitReturnLogistics(afterSaleId: string, userId: string, logisticsNo: string, logisticsCompany: string): AfterSaleOrder;
export declare function confirmReturnReceive(afterSaleId: string, operatorId: string, operatorRole: UserRole, warehouseId: string, receivedItems: {
    afterSaleItemId: string;
    actualQuantity: number;
}[]): AfterSaleOrder;
export declare function handleDifference(afterSaleId: string, handlerId: string, handlerRole: UserRole, differenceItemIds: string[], action: 'refund_actual' | 'cancel_difference'): AfterSaleOrder;
export declare function processExchangeOutbound(afterSaleId: string, operatorId: string, operatorRole: UserRole, warehouseId: string, exchangeProductId: string, logisticsNo: string, logisticsCompany: string): AfterSaleOrder;
export declare function convertExchangeToRefund(afterSaleId: string, operatorId: string, operatorRole: UserRole): AfterSaleOrder;
export declare function cancelAfterSale(afterSaleId: string, operatorId: string, operatorRole: UserRole): AfterSaleOrder;
export declare function completeAfterSale(afterSaleId: string, operatorId: string, operatorRole: UserRole): AfterSaleOrder;
export declare function addAfterSaleLog(afterSaleOrderId: string, operatorId: string, operatorRole: UserRole, action: string, fromStatus?: AfterSaleStatus, toStatus?: AfterSaleStatus, remark?: string): void;
export declare function getAfterSaleById(id: string): AfterSaleOrder;
export declare function getAfterSaleList(userId?: string, userRole?: UserRole, warehouseId?: string, status?: AfterSaleStatus, type?: AfterSaleType): any[];
export { processRefund, retryRefund };
