import { Request, Response, Router } from 'express';
import { authMiddleware, requireRoles } from '../middleware/auth';
import { getOne, getAll } from '../db';
import { UserRole, OrderStatus } from '../types';

const router = Router();

router.get('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { status } = req.query;

    let sql = `SELECT o.*, 
               (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as itemCount
               FROM orders o WHERE 1=1`;
    const params: any[] = [];

    if (user.role === UserRole.CUSTOMER) {
      sql += ' AND o.user_id = ?';
      params.push(user.userId);
    }

    if (status) {
      sql += ' AND o.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY o.created_at DESC';

    const orders = getAll<any>(sql, params);
    res.json(orders);
  } catch (err) {
    console.error('获取订单列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const order = getOne<any>('SELECT * FROM orders WHERE id = ?', [id]);

    if (!order) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }

    if (user.role === UserRole.CUSTOMER && order.user_id !== user.userId) {
      res.status(403).json({ error: '无权查看该订单' });
      return;
    }

    const items = getAll<any>(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at',
      [id]
    );

    res.json({ ...order, items });
  } catch (err) {
    console.error('获取订单详情失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:id/items', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const order = getOne<any>('SELECT * FROM orders WHERE id = ?', [id]);

    if (!order) {
      res.status(404).json({ error: '订单不存在' });
      return;
    }

    if (user.role === UserRole.CUSTOMER && order.user_id !== user.userId) {
      res.status(403).json({ error: '无权查看该订单' });
      return;
    }

    const items = getAll<any>(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at',
      [id]
    );

    res.json(items);
  } catch (err) {
    console.error('获取订单明细失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
