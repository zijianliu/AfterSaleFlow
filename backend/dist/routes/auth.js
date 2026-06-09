"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt = __importStar(require("bcryptjs"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: '用户名和密码不能为空' });
            return;
        }
        const user = (0, db_1.getOne)('SELECT id, username, password, role, warehouse_id as warehouseId FROM users WHERE username = ?', [username]);
        if (!user) {
            res.status(401).json({ error: '用户名或密码错误' });
            return;
        }
        const isValid = bcrypt.compareSync(password, user.password);
        if (!isValid) {
            res.status(401).json({ error: '用户名或密码错误' });
            return;
        }
        const token = (0, auth_1.generateToken)({
            userId: user.id,
            username: user.username,
            role: user.role,
            warehouseId: user.warehouseId || undefined,
        });
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                warehouseId: user.warehouseId,
            },
        });
    }
    catch (err) {
        console.error('登录失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/me', auth_1.authMiddleware, (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: '未授权' });
            return;
        }
        const user = (0, db_1.getOne)('SELECT id, username, role, warehouse_id as warehouseId, created_at as createdAt FROM users WHERE id = ?', [req.user.userId]);
        res.json(user);
    }
    catch (err) {
        console.error('获取用户信息失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
router.get('/users', auth_1.authMiddleware, (req, res) => {
    try {
        const users = (0, db_1.getAll)('SELECT id, username, role, warehouse_id as warehouseId, created_at as createdAt FROM users ORDER BY created_at DESC');
        res.json(users);
    }
    catch (err) {
        console.error('获取用户列表失败:', err);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map