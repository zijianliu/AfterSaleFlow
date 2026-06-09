import { AfterSaleStatus, AfterSaleType } from '../types';
export declare const validTransitions: Record<AfterSaleStatus, AfterSaleStatus[]>;
export declare function canTransition(from: AfterSaleStatus, to: AfterSaleStatus): boolean;
export declare function getReviewTargetStatus(type: AfterSaleType): AfterSaleStatus;
export declare const statusLabels: Record<AfterSaleStatus, string>;
export declare const typeLabels: Record<AfterSaleType, string>;
