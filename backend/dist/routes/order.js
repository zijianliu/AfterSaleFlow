"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const types_1 = require("../types");
const router = (0, express_1.Router)();
router.get('/', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { status } = req.query;
        let sql = `SELECT o.*, 
               (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as itemCount
               FROM orders o WHERE 1=1`;
        const params = [];
        if (user.role === types_1.UserRole.CUSTOMER) {
            sql += ' AND o.user_id = ?';
            params.push(user.userId);
        }
        if (status) {
            sql += ' AND o.status = ?';
            params.push(status);
        }
        sql += ' ORDER BY o.created_at DESC';
        const orders = (0, db_1.getAll)(sql, params);
        res.json(orders);
    }
    catch (err) {
        console.error('获取订单列表失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/:id', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const order = (0, db_1.getOne)('SELECT * FROM orders WHERE id = ?', [id]);
        if (!order) {
            res.status(404).json({ error: '订单不存在' });
            return;
        }
        if (user.role === types_1.UserRole.CUSTOMER && order.user_id !== user.userId) {
            res.status(403).json({ error: '无权查看该订单' });
            return;
        }
        const items = (0, db_1.getAll)('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at', [id]);
        res.json({ ...order, items });
    }
    catch (err) {
        console.error('获取订单详情失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/:id/items', auth_1.authMiddleware, (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const order = (0, db_1.getOne)('SELECT * FROM orders WHERE id = ?', [id]);
        if (!order) {
            res.status(404).json({ error: '订单不存在' });
            return;
        }
        if (user.role === types_1.UserRole.CUSTOMER && order.user_id !== user.userId) {
            res.status(403).json({ error: '无权查看该订单' });
            return;
        }
        const items = (0, db_1.getAll)('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at', [id]);
        res.json(items);
    }
    catch (err) {
        console.error('获取订单明细失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
exports.default = router;
//# sourceMappingURL=order.js.map