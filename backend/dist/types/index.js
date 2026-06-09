"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryChangeType = exports.RefundStatus = exports.AfterSaleStatus = exports.AfterSaleType = exports.OrderStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["CUSTOMER"] = "customer";
    UserRole["CS_AGENT"] = "cs_agent";
    UserRole["WAREHOUSE_STAFF"] = "warehouse_staff";
    UserRole["FINANCE_STAFF"] = "finance_staff";
    UserRole["ADMIN"] = "admin";
})(UserRole || (exports.UserRole = UserRole = {}));
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PENDING_PAYMENT"] = "pending_payment";
    OrderStatus["PAID"] = "paid";
    OrderStatus["SHIPPED"] = "shipped";
    OrderStatus["DELIVERED"] = "delivered";
    OrderStatus["COMPLETED"] = "completed";
    OrderStatus["CANCELLED"] = "cancelled";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
var AfterSaleType;
(function (AfterSaleType) {
    AfterSaleType["REFUND_ONLY"] = "refund_only";
    AfterSaleType["RETURN_REFUND"] = "return_refund";
    AfterSaleType["EXCHANGE"] = "exchange";
})(AfterSaleType || (exports.AfterSaleType = AfterSaleType = {}));
var AfterSaleStatus;
(function (AfterSaleStatus) {
    AfterSaleStatus["PENDING_REVIEW"] = "pending_review";
    AfterSaleStatus["REJECTED"] = "rejected";
    AfterSaleStatus["PENDING_USER_RETURN"] = "pending_user_return";
    AfterSaleStatus["PENDING_WAREHOUSE_RECEIVE"] = "pending_warehouse_receive";
    AfterSaleStatus["PENDING_REFUND"] = "pending_refund";
    AfterSaleStatus["REFUNDING"] = "refunding";
    AfterSaleStatus["REFUND_SUCCESS"] = "refund_success";
    AfterSaleStatus["REFUND_FAILED"] = "refund_failed";
    AfterSaleStatus["PENDING_EXCHANGE_OUTBOUND"] = "pending_exchange_outbound";
    AfterSaleStatus["EXCHANGE_SHIPPED"] = "exchange_shipped";
    AfterSaleStatus["COMPLETED"] = "completed";
    AfterSaleStatus["CANCELLED"] = "cancelled";
    AfterSaleStatus["PENDING_DIFFERENCE_HANDLING"] = "pending_difference_handling";
})(AfterSaleStatus || (exports.AfterSaleStatus = AfterSaleStatus = {}));
var RefundStatus;
(function (RefundStatus) {
    RefundStatus["PENDING"] = "pending";
    RefundStatus["PROCESSING"] = "processing";
    RefundStatus["SUCCESS"] = "success";
    RefundStatus["FAILED"] = "failed";
})(RefundStatus || (exports.RefundStatus = RefundStatus = {}));
var InventoryChangeType;
(function (InventoryChangeType) {
    InventoryChangeType["INBOUND"] = "inbound";
    InventoryChangeType["OUTBOUND"] = "outbound";
    InventoryChangeType["RETURN_INBOUND"] = "return_inbound";
    InventoryChangeType["EXCHANGE_OUTBOUND"] = "exchange_outbound";
    InventoryChangeType["ADJUSTMENT"] = "adjustment";
})(InventoryChangeType || (exports.InventoryChangeType = InventoryChangeType = {}));
//# sourceMappingURL=index.js.map