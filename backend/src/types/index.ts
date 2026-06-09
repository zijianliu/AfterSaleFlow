export enum UserRole {
  CUSTOMER = 'customer',
  CS_AGENT = 'cs_agent',
  WAREHOUSE_STAFF = 'warehouse_staff',
  FINANCE_STAFF = 'finance_staff',
  ADMIN = 'admin'
}

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum AfterSaleType {
  REFUND_ONLY = 'refund_only',
  RETURN_REFUND = 'return_refund',
  EXCHANGE = 'exchange'
}

export enum AfterSaleStatus {
  PENDING_REVIEW = 'pending_review',
  REJECTED = 'rejected',
  PENDING_USER_RETURN = 'pending_user_return',
  PENDING_WAREHOUSE_RECEIVE = 'pending_warehouse_receive',
  PENDING_REFUND = 'pending_refund',
  REFUNDING = 'refunding',
  REFUND_SUCCESS = 'refund_success',
  REFUND_FAILED = 'refund_failed',
  PENDING_EXCHANGE_OUTBOUND = 'pending_exchange_outbound',
  EXCHANGE_SHIPPED = 'exchange_shipped',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  PENDING_DIFFERENCE_HANDLING = 'pending_difference_handling'
}

export enum RefundStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed'
}

export enum InventoryChangeType {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  RETURN_INBOUND = 'return_inbound',
  EXCHANGE_OUTBOUND = 'exchange_outbound',
  ADJUSTMENT = 'adjustment'
}

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  warehouseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  warehouseId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Inventory {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  frozenQuantity: number;
  updatedAt: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  warehouseId: string;
  changeType: InventoryChangeType;
  quantity: number;
  referenceType: string;
  referenceId: string;
  operatorId: string;
  remark?: string;
  createdAt: string;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNo: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  payAmount: number;
  discountAmount: number;
  couponId?: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productSku: string;
  unitPrice: number;
  quantity: number;
  refundedQuantity: number;
  availableRefundQuantity: number;
  frozenRefundQuantity: number;
  createdAt: string;
}

export interface AfterSaleOrder {
  id: string;
  afterSaleNo: string;
  orderId: string;
  userId: string;
  type: AfterSaleType;
  status: AfterSaleStatus;
  reason: string;
  images?: string;
  applyAmount: number;
  actualRefundAmount: number;
  rejectReason?: string;
  reviewerId?: string;
  reviewedAt?: string;
  warehouseId: string;
  returnLogisticsNo?: string;
  returnLogisticsCompany?: string;
  exchangeProductId?: string;
  exchangeLogisticsNo?: string;
  exchangeLogisticsCompany?: string;
  differenceHandled?: boolean;
  differenceReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AfterSaleItem {
  id: string;
  afterSaleOrderId: string;
  orderItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  applyQuantity: number;
  actualQuantity: number;
  unitPrice: number;
  applyAmount: number;
  actualRefundAmount: number;
  createdAt: string;
}

export interface AfterSaleLog {
  id: string;
  afterSaleOrderId: string;
  operatorId: string;
  operatorRole: UserRole;
  action: string;
  fromStatus?: AfterSaleStatus;
  toStatus?: AfterSaleStatus;
  remark?: string;
  createdAt: string;
}

export interface RefundRecord {
  id: string;
  refundNo: string;
  afterSaleOrderId: string;
  orderId: string;
  userId: string;
  amount: number;
  status: RefundStatus;
  idempotencyKey: string;
  failureReason?: string;
  retryCount: number;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DifferenceRecord {
  id: string;
  afterSaleOrderId: string;
  afterSaleItemId: string;
  applyQuantity: number;
  actualQuantity: number;
  difference: number;
  reason?: string;
  handled: boolean;
  handlerId?: string;
  handledAt?: string;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  discountAmount: number;
  minAmount: number;
  userId?: string;
  orderId?: string;
  status: 'available' | 'used' | 'refunded';
  usedAt?: string;
  refundedAt?: string;
  createdAt: string;
}
