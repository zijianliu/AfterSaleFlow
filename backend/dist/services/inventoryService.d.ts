export declare function getInventory(productId: string, warehouseId: string): any | null;
export declare function returnInbound(productId: string, warehouseId: string, quantity: number, referenceType: string, referenceId: string, operatorId: string): void;
export declare function exchangeOutbound(productId: string, warehouseId: string, quantity: number, referenceType: string, referenceId: string, operatorId: string): void;
export declare function adjustInventory(productId: string, warehouseId: string, quantity: number, operatorId: string, remark: string): void;
export declare function getInventoryLogs(productId?: string, warehouseId?: string, limit?: number): any[];
export declare function getAllInventory(warehouseId?: string): any[];
