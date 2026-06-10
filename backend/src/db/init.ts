import { getDb, runSql, getOne, getAll, withTransaction } from './index';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { UserRole, OrderStatus, AfterSaleType, AfterSaleStatus } from '../types';

export function initDatabase(): void {
  const db = getDb();

  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      warehouse_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      sku TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      frozen_quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      UNIQUE(product_id, warehouse_id)
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      change_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      remark TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      total_amount REAL NOT NULL,
      pay_amount REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      coupon_id TEXT,
      address TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      refunded_quantity INTEGER NOT NULL DEFAULT 0,
      available_refund_quantity INTEGER NOT NULL DEFAULT 0,
      frozen_refund_quantity INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS after_sale_orders (
      id TEXT PRIMARY KEY,
      after_sale_no TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      images TEXT,
      apply_amount REAL NOT NULL,
      actual_refund_amount REAL NOT NULL DEFAULT 0,
      reject_reason TEXT,
      reviewer_id TEXT,
      reviewed_at TEXT,
      warehouse_id TEXT NOT NULL,
      return_logistics_no TEXT,
      return_logistics_company TEXT,
      exchange_product_id TEXT,
      exchange_logistics_no TEXT,
      exchange_logistics_company TEXT,
      difference_handled INTEGER DEFAULT 0,
      difference_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE IF NOT EXISTS after_sale_items (
      id TEXT PRIMARY KEY,
      after_sale_order_id TEXT NOT NULL,
      order_item_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT NOT NULL,
      apply_quantity INTEGER NOT NULL,
      actual_quantity INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL,
      apply_amount REAL NOT NULL,
      actual_refund_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (after_sale_order_id) REFERENCES after_sale_orders(id),
      FOREIGN KEY (order_item_id) REFERENCES order_items(id)
    );

    CREATE TABLE IF NOT EXISTS after_sale_logs (
      id TEXT PRIMARY KEY,
      after_sale_order_id TEXT NOT NULL,
      operator_id TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      remark TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (after_sale_order_id) REFERENCES after_sale_orders(id)
    );

    CREATE TABLE IF NOT EXISTS refund_records (
      id TEXT PRIMARY KEY,
      refund_no TEXT UNIQUE NOT NULL,
      after_sale_order_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      failure_reason TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (after_sale_order_id) REFERENCES after_sale_orders(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS difference_records (
      id TEXT PRIMARY KEY,
      after_sale_order_id TEXT NOT NULL,
      after_sale_item_id TEXT NOT NULL,
      apply_quantity INTEGER NOT NULL,
      actual_quantity INTEGER NOT NULL,
      difference INTEGER NOT NULL,
      reason TEXT,
      handled INTEGER NOT NULL DEFAULT 0,
      handler_id TEXT,
      handled_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (after_sale_order_id) REFERENCES after_sale_orders(id),
      FOREIGN KEY (after_sale_item_id) REFERENCES after_sale_items(id)
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      discount_amount REAL NOT NULL,
      min_amount REAL NOT NULL,
      user_id TEXT,
      order_id TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      used_at TEXT,
      refunded_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_after_sale_orders_user_id ON after_sale_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_after_sale_orders_status ON after_sale_orders(status);
    CREATE INDEX IF NOT EXISTS idx_after_sale_orders_order_id ON after_sale_orders(order_id);
    CREATE INDEX IF NOT EXISTS idx_after_sale_items_after_sale_order_id ON after_sale_items(after_sale_order_id);
    CREATE INDEX IF NOT EXISTS idx_after_sale_logs_after_sale_order_id ON after_sale_logs(after_sale_order_id);
    CREATE INDEX IF NOT EXISTS idx_refund_records_after_sale_order_id ON refund_records(after_sale_order_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_product_warehouse ON inventory(product_id, warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_warehouse ON inventory_logs(product_id, warehouse_id);
  `;

  db.exec(schemaSql);
  migrateSchema();
  seedData();
}

function migrateSchema(): void {
  const db = getDb();
  
  const cols = db.pragma('table_info(orders)') as any[];
  const hasRefundedAmount = cols.some((c: any) => c.name === 'refunded_amount');
  if (!hasRefundedAmount) {
    db.exec(`ALTER TABLE orders ADD COLUMN refunded_amount REAL NOT NULL DEFAULT 0`);
  }
  
  const itemCols = db.pragma('table_info(order_items)') as any[];
  const hasItemRefundedAmount = itemCols.some((c: any) => c.name === 'refunded_amount');
  if (!hasItemRefundedAmount) {
    db.exec(`ALTER TABLE order_items ADD COLUMN refunded_amount REAL NOT NULL DEFAULT 0`);
  }
}

function seedData(): void {
  const userCount = getOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (userCount && userCount.count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const hashedPassword = bcrypt.hashSync('123456', 10);

  const warehouse1Id = uuidv4();
  const warehouse2Id = uuidv4();

  runSql(
    'INSERT INTO warehouses (id, name, address, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
    [
      warehouse1Id, '北京仓', '北京市朝阳区建国路88号', now,
      warehouse2Id, '上海仓', '上海市浦东新区陆家嘴环路100号', now
    ]
  );

  const users = [
    { id: uuidv4(), username: 'user1', role: UserRole.CUSTOMER, warehouseId: null },
    { id: uuidv4(), username: 'user2', role: UserRole.CUSTOMER, warehouseId: null },
    { id: uuidv4(), username: 'cs1', role: UserRole.CS_AGENT, warehouseId: null },
    { id: uuidv4(), username: 'wh1', role: UserRole.WAREHOUSE_STAFF, warehouseId: warehouse1Id },
    { id: uuidv4(), username: 'wh2', role: UserRole.WAREHOUSE_STAFF, warehouseId: warehouse2Id },
    { id: uuidv4(), username: 'finance1', role: UserRole.FINANCE_STAFF, warehouseId: null },
    { id: uuidv4(), username: 'admin', role: UserRole.ADMIN, warehouseId: null },
  ];

  for (const user of users) {
    runSql(
      'INSERT INTO users (id, username, password, role, warehouse_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.username, hashedPassword, user.role, user.warehouseId, now, now]
    );
  }

  const products = [
    { id: uuidv4(), name: 'iPhone 15 Pro', price: 7999, sku: 'IP15P-256-BK', warehouseId: warehouse1Id, qty: 100 },
    { id: uuidv4(), name: 'MacBook Pro 14', price: 14999, sku: 'MBP14-M3-SLV', warehouseId: warehouse1Id, qty: 50 },
    { id: uuidv4(), name: 'AirPods Pro', price: 1899, sku: 'APP2-WHITE', warehouseId: warehouse1Id, qty: 200 },
    { id: uuidv4(), name: '华为 Mate 60 Pro', price: 6999, sku: 'HW-M60P-512-BK', warehouseId: warehouse2Id, qty: 80 },
    { id: uuidv4(), name: '小米 14 Ultra', price: 5999, sku: 'MI-14U-256-WH', warehouseId: warehouse2Id, qty: 120 },
  ];

  for (const product of products) {
    runSql(
      'INSERT INTO products (id, name, price, sku, warehouse_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [product.id, product.name, product.price, product.sku, product.warehouseId, now, now]
    );
    const invId = uuidv4();
    runSql(
      'INSERT INTO inventory (id, product_id, warehouse_id, quantity, frozen_quantity, updated_at) VALUES (?, ?, ?, ?, 0, ?)',
      [invId, product.id, product.warehouseId, product.qty, now]
    );
  }

  const customer1 = users[0];
  const customer2 = users[1];
  const product1 = products[0];
  const product2 = products[1];
  const product3 = products[2];

  createTestOrder(customer1.id, [product1, product2], warehouse1Id, OrderStatus.COMPLETED, 1);
  createTestOrder(customer1.id, [product3], warehouse1Id, OrderStatus.SHIPPED, 2);
  createTestOrder(customer2.id, [product1], warehouse1Id, OrderStatus.DELIVERED, 3);
  createTestOrder(customer1.id, [product1], warehouse1Id, OrderStatus.PENDING_PAYMENT, 4);
  createTestOrder(customer2.id, [product3], warehouse1Id, OrderStatus.CANCELLED, 5);
}

function createTestOrder(
  userId: string,
  products: { id: string; name: string; sku: string; price: number; warehouseId: string }[],
  warehouseId: string,
  status: OrderStatus,
  seq: number
): void {
  const now = new Date().toISOString();
  const orderId = uuidv4();
  const orderNo = `ORD${Date.now()}${String(seq).padStart(4, '0')}`;

  let totalAmount = 0;
  const items: { id: string; productId: string; productName: string; productSku: string; unitPrice: number; quantity: number; availableRefundQuantity: number }[] = [];

  for (const product of products) {
    const qty = 2;
    const itemAmount = product.price * qty;
    totalAmount += itemAmount;
    items.push({
      id: uuidv4(),
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      unitPrice: product.price,
      quantity: qty,
      availableRefundQuantity: (status === OrderStatus.COMPLETED || status === OrderStatus.DELIVERED || status === OrderStatus.SHIPPED) ? qty : 0
    });
  }

  const discountAmount = totalAmount > 10000 ? 500 : 0;
  const payAmount = totalAmount - discountAmount;
  const address = '北京市朝阳区测试地址 100号';

  runSql(
    'INSERT INTO orders (id, order_no, user_id, status, total_amount, pay_amount, discount_amount, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [orderId, orderNo, userId, status, totalAmount, payAmount, discountAmount, address, now, now]
  );

  for (const item of items) {
    runSql(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_sku, unit_price, quantity, refunded_quantity, available_refund_quantity, frozen_refund_quantity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?)`,
      [item.id, orderId, item.productId, item.productName, item.productSku, item.unitPrice, item.quantity, item.availableRefundQuantity, now]
    );
  }
}
