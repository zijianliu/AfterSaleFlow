import { Request, Response, Router } from 'express';
import { authMiddleware, requireRoles } from '../middleware/auth';
import {
  createAfterSale,
  reviewAfterSale,
  submitReturnLogistics,
  confirmReturnReceive,
  processExchangeOutbound,
  convertExchangeToRefund,
  cancelAfterSale,
  completeAfterSale,
  getAfterSaleById,
  getAfterSaleList,
  handleDifference,
} from '../services/afterSaleService';
import { retryRefund, getRefundList } from '../services/refundService';
import { UserRole, AfterSaleStatus, AfterSaleType, RefundStatus } from '../types';
import { getAllInventory, getInventoryLogs } from '../services/inventoryService';
import { getAll } from '../db';
import { statusLabels, typeLabels } from '../services/stateMachine';

const router = Router();

router.get('/status/labels', authMiddleware, (req: Request, res: Response) => {
  try {
    res.json({
      statusLabels,
      typeLabels,
    });
  } catch (err: any) {
    console.error('获取状态标签失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { orderId, type, reason, images, items } = req.body;

    if (!orderId || !type || !reason || !items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: '参数不完整' });
      return;
    }

    const result = createAfterSale(
      user.userId,
      orderId,
      type as AfterSaleType,
      reason,
      images,
      items
    );

    res.json(result);
  } catch (err: any) {
    console.error('创建售后失败:', err);
    res.status(400).json({ error: err.message || '创建售后失败' });
  }
});

router.get('/', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { status, type } = req.query;

    const list = getAfterSaleList(
      user.userId,
      user.role as UserRole,
      user.warehouseId,
      status as AfterSaleStatus,
      type as AfterSaleType
    );

    res.json(list);
  } catch (err: any) {
    console.error('获取售后列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const afterSale = getAfterSaleById(id);

    if (user.role === UserRole.CUSTOMER && (afterSale as any).user_id !== user.userId) {
      res.status(403).json({ error: '无权查看该售后单' });
      return;
    }

    if (user.role === UserRole.WAREHOUSE_STAFF && user.warehouseId && (afterSale as any).warehouse_id !== user.warehouseId) {
      res.status(403).json({ error: '无权查看其他仓库的售后单' });
      return;
    }

    res.json(afterSale);
  } catch (err: any) {
    console.error('获取售后详情失败:', err);
    res.status(404).json({ error: err.message || '售后单不存在' });
  }
});

router.post('/:id/review', authMiddleware, requireRoles(UserRole.CS_AGENT, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { approved, rejectReason } = req.body;

    const result = reviewAfterSale(
      id,
      user.userId,
      user.role as UserRole,
      approved,
      rejectReason
    );

    res.json(result);
  } catch (err: any) {
    console.error('审核失败:', err);
    res.status(400).json({ error: err.message || '审核失败' });
  }
});

router.post('/:id/return-logistics', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { logisticsNo, logisticsCompany } = req.body;

    if (!logisticsNo || !logisticsCompany) {
      res.status(400).json({ error: '物流信息不完整' });
      return;
    }

    const result = submitReturnLogistics(id, user.userId, logisticsNo, logisticsCompany);
    res.json(result);
  } catch (err: any) {
    console.error('填写退货物流失败:', err);
    res.status(400).json({ error: err.message || '填写退货物流失败' });
  }
});

router.post('/:id/confirm-receive', authMiddleware, requireRoles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const user = req.user!;
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

    const result = confirmReturnReceive(
      id,
      user.userId,
      user.role as UserRole,
      user.warehouseId,
      receivedItems
    );

    res.json(result);
  } catch (err: any) {
    console.error('确认收货失败:', err);
    res.status(400).json({ error: err.message || '确认收货失败' });
  }
});

router.post('/:id/handle-difference', authMiddleware, requireRoles(UserRole.CS_AGENT, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;
    const { differenceItemIds, action } = req.body;

    if (!differenceItemIds || !Array.isArray(differenceItemIds) || !action) {
      res.status(400).json({ error: '参数不完整' });
      return;
    }

    const result = handleDifference(
      id,
      user.userId,
      user.role as UserRole,
      differenceItemIds,
      action
    );

    res.json(result);
  } catch (err: any) {
    console.error('差异处理失败:', err);
    res.status(400).json({ error: err.message || '差异处理失败' });
  }
});

router.post('/:id/exchange-outbound', authMiddleware, requireRoles(UserRole.WAREHOUSE_STAFF, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const user = req.user!;
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

    const result = processExchangeOutbound(
      id,
      user.userId,
      user.role as UserRole,
      user.warehouseId,
      exchangeProductId,
      logisticsNo,
      logisticsCompany
    );

    res.json(result);
  } catch (err: any) {
    console.error('换货出库失败:', err);
    res.status(400).json({ error: err.message || '换货出库失败' });
  }
});

router.post('/:id/convert-to-refund', authMiddleware, requireRoles(UserRole.CS_AGENT, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const result = convertExchangeToRefund(id, user.userId, user.role as UserRole);
    res.json(result);
  } catch (err: any) {
    console.error('转退款失败:', err);
    res.status(400).json({ error: err.message || '转退款失败' });
  }
});

router.post('/:id/cancel', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const result = cancelAfterSale(id, user.userId, user.role as UserRole);
    res.json(result);
  } catch (err: any) {
    console.error('取消售后失败:', err);
    res.status(400).json({ error: err.message || '取消售后失败' });
  }
});

router.post('/:id/complete', authMiddleware, requireRoles(UserRole.CS_AGENT, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const result = completeAfterSale(id, user.userId, user.role as UserRole);
    res.json(result);
  } catch (err: any) {
    console.error('完成售后失败:', err);
    res.status(400).json({ error: err.message || '完成售后失败' });
  }
});

router.post('/:id/retry-refund', authMiddleware, requireRoles(UserRole.FINANCE_STAFF, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    retryRefund(id, user.userId, user.role as UserRole);
    const result = getAfterSaleById(id);
    res.json(result);
  } catch (err: any) {
    console.error('重试退款失败:', err);
    res.status(400).json({ error: err.message || '重试退款失败' });
  }
});

router.get('/refunds/list', authMiddleware, requireRoles(UserRole.FINANCE_STAFF, UserRole.ADMIN), (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const list = getRefundList(status as RefundStatus);
    res.json(list);
  } catch (err: any) {
    console.error('获取退款列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/inventory/list', authMiddleware, (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const warehouseId = user.role === UserRole.WAREHOUSE_STAFF ? user.warehouseId : undefined;

    const list = getAllInventory(warehouseId);
    res.json(list);
  } catch (err: any) {
    console.error('获取库存列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/inventory/logs', authMiddleware, (req: Request, res: Response) => {
  try {
    const { productId } = req.query;
    const user = req.user!;
    const warehouseId = user.role === UserRole.WAREHOUSE_STAFF ? user.warehouseId : undefined;

    const logs = getInventoryLogs(productId as string, warehouseId);
    res.json(logs);
  } catch (err: any) {
    console.error('获取库存流水失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/products/all', authMiddleware, (req: Request, res: Response) => {
  try {
    const products = getAll<any>(
      `SELECT p.*, w.name as warehouse_name, i.quantity as inventory_quantity
       FROM products p
       LEFT JOIN warehouses w ON p.warehouse_id = w.id
       LEFT JOIN inventory i ON p.id = i.product_id AND p.warehouse_id = i.warehouse_id
       ORDER BY p.created_at DESC`
    );
    res.json(products);
  } catch (err: any) {
    console.error('获取商品列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/warehouses/all', authMiddleware, (req: Request, res: Response) => {
  try {
    const warehouses = getAll<any>('SELECT * FROM warehouses ORDER BY created_at');
    res.json(warehouses);
  } catch (err: any) {
    console.error('获取仓库列表失败:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
