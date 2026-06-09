import { Request, Response, Router } from 'express';
import * as bcrypt from 'bcryptjs';
import { getOne, getAll } from '../db';
import { generateToken, authMiddleware } from '../middleware/auth';
import { UserRole } from '../types';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: '用户名和密码不能为空' });
      return;
    }

    const user = getOne<any>(
      'SELECT id, username, password, role, warehouse_id as warehouseId FROM users WHERE username = ?',
      [username]
    );

    if (!user) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role as UserRole,
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
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: '未授权' });
      return;
    }

    const user = getOne<any>(
      'SELECT id, username, role, warehouse_id as warehouseId, created_at as createdAt FROM users WHERE id = ?',
      [req.user.userId]
    );

    res.json(user);
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/users', authMiddleware, (req: Request, res: Response) => {
  try {
    const users = getAll<any>(
      'SELECT id, username, role, warehouse_id as warehouseId, created_at as createdAt FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
