"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const afterSaleService_1 = require("../services/afterSaleService");
const refundService_1 = require("../services/refundService");
const types_1 = require("../types");
const inventoryService_1 = require("../services/inventoryService");
const db_1 = require("../db");
const router = (0, express_1.Router)();
router.post('/', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { orderId, type, reason, images, items } = req.body;
        if (!orderId || !type || !reason || !items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({ error: '参数不完整' });
            return;
        }
        const result = (0, afterSaleService_1.createAfterSale)(user.userId, orderId, type, reason, images, items);
        res.json(result);
    }
    catch (err) {
        console.error('创建售后失败:', err);
        res.status(400).json({ error: err.message || '创建售后失败' });
    }
});
router.get('/', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { status, type } = req.query;
        const list = (0, afterSaleService_1.getAfterSaleList)(user.userId, user.role, user.warehouseId, status, type);
        res.json(list);
    }
    catch (err) {
        console.error('获取售后列表失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/:id', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const afterSale = (0, afterSaleService_1.getAfterSaleById)(id);
        if (user.role === types_1.UserRole.CUSTOMER && afterSale.user_id !== user.userId) {
            res.status(403).json({ error: '无权查看该售后单' });
            return;
        }
        if (user.role === types_1.UserRole.WAREHOUSE_STAFF && user.warehouseId && afterSale.warehouse_id !== user.warehouseId) {
            res.status(403).json({ error: '无权查看其他仓库的售后单' });
            return;
        }
        res.json(afterSale);
    }
    catch (err) {
        console.error('获取售后详情失败:', err);
        res.status(404).json({ error: err.message || '售后单不存在' });
    }
});
router.post('/:id/review', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.CS_AGENT, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const { approved, rejectReason } = req.body;
        const result = (0, afterSaleService_1.reviewAfterSale)(id, user.userId, user.role, approved, rejectReason);
        res.json(result);
    }
    catch (err) {
        console.error('审核失败:', err);
        res.status(400).json({ error: err.message || '审核失败' });
    }
});
router.post('/:id/return-logistics', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const { logisticsNo, logisticsCompany } = req.body;
        if (!logisticsNo || !logisticsCompany) {
            res.status(400).json({ error: '物流信息不完整' });
            return;
        }
        const result = (0, afterSaleService_1.submitReturnLogistics)(id, user.userId, logisticsNo, logisticsCompany);
        res.json(result);
    }
    catch (err) {
        console.error('填写退货物流失败:', err);
        res.status(400).json({ error: err.message || '填写退货物流失败' });
    }
});
router.post('/:id/confirm-receive', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.WAREHOUSE_STAFF, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const { receivedItems } = req.body;
        if (!user.warehouseId) {
            res.status(400).json({ error: '用户未绑定仓库' });
            return;
        }
        if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
            res.status(400).json({ error: '收货明细不完整' });
            return;
        }
        const result = (0, afterSaleService_1.confirmReturnReceive)(id, user.userId, user.role, user.warehouseId, receivedItems);
        res.json(result);
    }
    catch (err) {
        console.error('确认收货失败:', err);
        res.status(400).json({ error: err.message || '确认收货失败' });
    }
});
router.post('/:id/handle-difference', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.CS_AGENT, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const { differenceItemIds, action } = req.body;
        if (!differenceItemIds || !Array.isArray(differenceItemIds) || !action) {
            res.status(400).json({ error: '参数不完整' });
            return;
        }
        const result = (0, afterSaleService_1.handleDifference)(id, user.userId, user.role, differenceItemIds, action);
        res.json(result);
    }
    catch (err) {
        console.error('差异处理失败:', err);
        res.status(400).json({ error: err.message || '差异处理失败' });
    }
});
router.post('/:id/exchange-outbound', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.WAREHOUSE_STAFF, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const { exchangeProductId, logisticsNo, logisticsCompany } = req.body;
        if (!user.warehouseId) {
            res.status(400).json({ error: '用户未绑定仓库' });
            return;
        }
        if (!exchangeProductId || !logisticsNo || !logisticsCompany) {
            res.status(400).json({ error: '参数不完整' });
            return;
        }
        const result = (0, afterSaleService_1.processExchangeOutbound)(id, user.userId, user.role, user.warehouseId, exchangeProductId, logisticsNo, logisticsCompany);
        res.json(result);
    }
    catch (err) {
        console.error('换货出库失败:', err);
        res.status(400).json({ error: err.message || '换货出库失败' });
    }
});
router.post('/:id/convert-to-refund', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.CS_AGENT, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const result = (0, afterSaleService_1.convertExchangeToRefund)(id, user.userId, user.role);
        res.json(result);
    }
    catch (err) {
        console.error('转退款失败:', err);
        res.status(400).json({ error: err.message || '转退款失败' });
    }
});
router.post('/:id/cancel', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const result = (0, afterSaleService_1.cancelAfterSale)(id, user.userId, user.role);
        res.json(result);
    }
    catch (err) {
        console.error('取消售后失败:', err);
        res.status(400).json({ error: err.message || '取消售后失败' });
    }
});
router.post('/:id/complete', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.CS_AGENT, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const result = (0, afterSaleService_1.completeAfterSale)(id, user.userId, user.role);
        res.json(result);
    }
    catch (err) {
        console.error('完成售后失败:', err);
        res.status(400).json({ error: err.message || '完成售后失败' });
    }
});
router.post('/:id/retry-refund', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.FINANCE_STAFF, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        (0, refundService_1.retryRefund)(id, user.userId, user.role);
        const result = (0, afterSaleService_1.getAfterSaleById)(id);
        res.json(result);
    }
    catch (err) {
        console.error('重试退款失败:', err);
        res.status(400).json({ error: err.message || '重试退款失败' });
    }
});
router.get('/refunds/list', auth_1.authMiddleware, (0, auth_1.requireRoles)(types_1.UserRole.FINANCE_STAFF, types_1.UserRole.ADMIN), (req, res) => {
    try {
        const { status } = req.query;
        const list = (0, refundService_1.getRefundList)(status);
        res.json(list);
    }
    catch (err) {
        console.error('获取退款列表失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/inventory/list', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const warehouseId = user.role === types_1.UserRole.WAREHOUSE_STAFF ? user.warehouseId : undefined;
        const list = (0, inventoryService_1.getAllInventory)(warehouseId);
        res.json(list);
    }
    catch (err) {
        console.error('获取库存列表失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/inventory/logs', auth_1.authMiddleware, (req, res) => {
    try {
        const { productId } = req.query;
        const user = req.user;
        const warehouseId = user.role === types_1.UserRole.WAREHOUSE_STAFF ? user.warehouseId : undefined;
        const logs = (0, inventoryService_1.getInventoryLogs)(productId, warehouseId);
        res.json(logs);
    }
    catch (err) {
        console.error('获取库存流水失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/products/all', auth_1.authMiddleware, (req, res) => {
    try {
        const products = (0, db_1.getAll)(`SELECT p.*, w.name as warehouse_name, i.quantity as inventory_quantity
       FROM products p
       LEFT JOIN warehouses w ON p.warehouse_id = w.id
       LEFT JOIN inventory i ON p.id = i.product_id AND p.warehouse_id = i.warehouse_id
       ORDER BY p.created_at DESC`);
        res.json(products);
    }
    catch (err) {
        console.error('获取商品列表失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/warehouses/all', auth_1.authMiddleware, (req, res) => {
    try {
        const warehouses = (0, db_1.getAll)('SELECT * FROM warehouses ORDER BY created_at');
        res.json(warehouses);
    }
    catch (err) {
        console.error('获取仓库列表失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
exports.default = router;
//# sourceMappingURL=afterSale.js.map