"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInventory = getInventory;
exports.returnInbound = returnInbound;
exports.exchangeOutbound = exchangeOutbound;
exports.adjustInventory = adjustInventory;
exports.getInventoryLogs = getInventoryLogs;
exports.getAllInventory = getAllInventory;
const uuid_1 = require("uuid");
const db_1 = require("../db");
const types_1 = require("../types");
function getInventory(productId, warehouseId) {
    return (0, db_1.getOne)('SELECT * FROM inventory WHERE product_id = ? AND warehouse_id = ?', [productId, warehouseId]);
}
function returnInbound(productId, warehouseId, quantity, referenceType, referenceId, operatorId) {
    (0, db_1.withTransaction)(() => {
        if (quantity <= 0) {
            return;
        }
        const inventory = getInventory(productId, warehouseId);
        if (!inventory) {
            const invId = (0, uuid_1.v4)();
            const now = new Date().toISOString();
            (0, db_1.runSql)('INSERT INTO inventory (id, product_id, warehouse_id, quantity, frozen_quantity, updated_at) VALUES (?, ?, ?, ?, 0, ?)', [invId, productId, warehouseId, quantity, now]);
        }
        else {
            (0, db_1.runSql)('UPDATE inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?', [quantity, new Date().toISOString(), inventory.id]);
        }
        createInventoryLog(productId, warehouseId, types_1.InventoryChangeType.RETURN_INBOUND, quantity, referenceType, referenceId, operatorId, '退货入库');
    });
}
function exchangeOutbound(productId, warehouseId, quantity, referenceType, referenceId, operatorId) {
    (0, db_1.withTransaction)(() => {
        if (quantity <= 0) {
            throw new Error('出库数量必须大于0');
        }
        const inventory = getInventory(productId, warehouseId);
        if (!inventory || inventory.quantity < quantity) {
            throw new Error('库存不足，无法出库');
        }
        const result = (0, db_1.runSql)('UPDATE inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ? AND quantity >= ?', [quantity, new Date().toISOString(), inventory.id, quantity]);
        if (result.changes === 0) {
            throw new Error('库存扣减失败，库存不足');
        }
        createInventoryLog(productId, warehouseId, types_1.InventoryChangeType.EXCHANGE_OUTBOUND, -quantity, referenceType, referenceId, operatorId, '换货出库');
    });
}
function adjustInventory(productId, warehouseId, quantity, operatorId, remark) {
    (0, db_1.withTransaction)(() => {
        const inventory = getInventory(productId, warehouseId);
        if (!inventory) {
            throw new Error('库存记录不存在');
        }
        const newQuantity = inventory.quantity + quantity;
        if (newQuantity < 0) {
            throw new Error('调整后库存不能为负数');
        }
        (0, db_1.runSql)('UPDATE inventory SET quantity = ?, updated_at = ? WHERE id = ?', [newQuantity, new Date().toISOString(), inventory.id]);
        createInventoryLog(productId, warehouseId, types_1.InventoryChangeType.ADJUSTMENT, quantity, 'manual_adjust', (0, uuid_1.v4)(), operatorId, remark);
    });
}
function createInventoryLog(productId, warehouseId, changeType, quantity, referenceType, referenceId, operatorId, remark) {
    const logId = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    (0, db_1.runSql)(`INSERT INTO inventory_logs (
      id, product_id, warehouse_id, change_type, quantity,
      reference_type, reference_id, operator_id, remark, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [logId, productId, warehouseId, changeType, quantity, referenceType, referenceId, operatorId, remark, now]);
}
function getInventoryLogs(productId, warehouseId, limit = 50) {
    let sql = 'SELECT * FROM inventory_logs WHERE 1=1';
    const params = [];
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
    return (0, db_1.getAll)(sql, params);
}
function getAllInventory(warehouseId) {
    let sql = `SELECT i.*, p.name as product_name, p.sku as product_sku, w.name as warehouse_name
             FROM inventory i
             LEFT JOIN products p ON i.product_id = p.id
             LEFT JOIN warehouses w ON i.warehouse_id = w.id
             WHERE 1=1`;
    const params = [];
    if (warehouseId) {
        sql += ' AND i.warehouse_id = ?';
        params.push(warehouseId);
    }
    sql += ' ORDER BY i.updated_at DESC';
    return (0, db_1.getAll)(sql, params);
}
//# sourceMappingURL=inventoryService.js.map