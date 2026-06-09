import { RefundStatus, UserRole } from '../types';
export declare function processRefund(afterSaleId: string, operatorId: string): void;
export declare function retryRefund(afterSaleId: string, operatorId: string, operatorRole: UserRole): void;
export declare function getRefundByAfterSaleId(afterSaleId: string): any | null;
export declare function getRefundList(status?: RefundStatus): any[];
