import { v4 as uuidv4 } from 'uuid';
import { runSql, getOne, getAll, withTransaction } from '../db';
import { InventoryChangeType } from '../types';

export function getInventory(productId: string, warehouseId: string): any | null {
  return getOne<any>(
    'SELECT * FROM inventory WHERE product_id = ? AND warehouse_id = ?',
    [productId, warehouseId]
  );
}

export function returnInbound(
  productId: string,
  warehouseId: string,
  quantity: number,
  referenceType: string,
  referenceId: string,
  operatorId: string
): void {
  withTransaction(() => {
    if (quantity <= 0) {
      return;
    }

    const inventory = getInventory(productId, warehouseId);

    if (!inventory) {
      const invId = uuidv4();
      const now = new Date().toISOString();
      runSql(
        'INSERT INTO inventory (id, product_id, warehouse_id, quantity, frozen_quantity, updated_at) VALUES (?, ?, ?, ?, 0, ?)',
        [invId, productId, warehouseId, quantity, now]
      );
    } else {
      runSql(
        'UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
        [quantity, new Date().toISOString(), inventory.id]
      );
    }

    createInventoryLog(
      productId,
      warehouseId,
      InventoryChangeType.RETURN_INBOUND,
      quantity,
      referenceType,
      referenceId,
      operatorId,
      '退货入库'
    );
  });
}

export function exchangeOutbound(
  productId: string,
  warehouseId: string,
  quantity: number,
  referenceType: string,
  referenceId: string,
  operatorId: string
): void {
  withTransaction(() => {
    if (quantity <= 0) {
      throw new Error('出库数量必须大于0');
    }

    const inventory = getInventory(productId, warehouseId);

    if (!inventory || inventory.quantity < quantity) {
      throw new Error('库存不足，无法出库');
    }

    const result = runSql(
      'UPDATE inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ? AND quantity >= ?',
      [quantity, new Date().toISOString(), inventory.id, quantity]
    );

    if (result.changes === 0) {
      throw new Error('库存扣减失败，库存不足');
    }

    createInventoryLog(
      productId,
      warehouseId,
      InventoryChangeType.EXCHANGE_OUTBOUND,
      -quantity,
      referenceType,
      referenceId,
      operatorId,
      '换货出库'
    );
  });
}

export function adjustInventory(
  productId: string,
  warehouseId: string,
  quantity: number,
  operatorId: string,
  remark: string
): void {
  withTransaction(() => {
    const inventory = getInventory(productId, warehouseId);

    if (!inventory) {
      throw new Error('库存记录不存在');
    }

    const newQuantity = inventory.quantity + quantity;
    if (newQuantity < 0) {
      throw new Error('调整后库存不能为负数');
    }

    runSql(
      'UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?',
      [newQuantity, new Date().toISOString(), inventory.id]
    );

    createInventoryLog(
      productId,
      warehouseId,
      InventoryChangeType.ADJUSTMENT,
      quantity,
      'manual_adjust',
      uuidv4(),
      operatorId,
      remark
    );
  });
}

function createInventoryLog(
  productId: string,
  warehouseId: string,
  changeType: InventoryChangeType,
  quantity: number,
  referenceType: string,
  referenceId: string,
  operatorId: string,
  remark: string
): void {
  const logId = uuidv4();
  const now = new Date().toISOString();

  runSql(
    `INSERT INTO inventory_logs (
      id, product_id, warehouse_id, change_type, quantity,
      reference_type, reference_id, operator_id, remark, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [logId, productId, warehouseId, changeType, quantity, referenceType, referenceId, operatorId, remark, now]
  );
}

export function getInventoryLogs(
  productId?: string,
  warehouseId?: string,
  limit: number = 50
): any[] {
  let sql = 'SELECT * FROM inventory_logs WHERE 1=1';
  const params: any[] = [];

  if (productId) {
    sql += ' AND product_id = ?';
    params.push(productId);
  }

  if (warehouseId) {
    sql += ' AND warehouse_id = ?';
    params.push(warehouseId);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return getAll<any>(sql, params);
}

export function getAllInventory(warehouseId?: string): any[] {
  let sql = `SELECT i.*, p.name as product_name, p.sku as product_sku, w.name as warehouse_name
             FROM inventory i
             LEFT JOIN products p ON i.product_id = p.id
             LEFT JOIN warehouses w ON i.warehouse_id = w.id
             WHERE 1=1`;
  const params: any[] = [];

  if (warehouseId) {
    sql += ' AND i.warehouse_id = ?';
    params.push(warehouseId);
  }

  sql += ' ORDER BY i.updated_at DESC';

  return getAll<any>(sql, params);
}
