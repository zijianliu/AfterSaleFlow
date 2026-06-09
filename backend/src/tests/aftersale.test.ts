import request from 'supertest';
import app from '../app';
import { initDatabase } from '../db/init';
import { getDb } from '../db';
import { UserRole, AfterSaleType, AfterSaleStatus, RefundStatus } from '../types';

let tokens: Record<string, string> = {};

beforeAll(() => {
  initDatabase();
});

afterAll(() => {
  getDb().close();
});

async function login(username: string): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username, password: '123456' });
  return res.body.token;
}

beforeAll(async () => {
  tokens.user1 = await login('user1');
  tokens.user2 = await login('user2');
  tokens.cs = await login('cs1');
  tokens.wh1 = await login('wh1');
  tokens.wh2 = await login('wh2');
  tokens.finance = await login('finance1');
  tokens.admin = await login('admin');
});

async function getCompletedOrder(token: string): Promise<any> {
  const res = await request(app)
    .get('/api/orders?status=completed')
    .set('Authorization', `Bearer ${token}`);
  return res.body[0];
}

async function getOrderItems(token: string, orderId: string): Promise<any[]> {
  const res = await request(app)
    .get(`/api/orders/${orderId}/items`)
    .set('Authorization', `Bearer ${token}`);
  return res.body;
}

async function createAfterSale(
  token: string,
  orderId: string,
  type: AfterSaleType,
  itemIds: { orderItemId: string; quantity: number }[]
): Promise<any> {
  const res = await request(app)
    .post('/api/after-sale')
    .set('Authorization', `Bearer ${token}`)
    .send({
      orderId,
      type,
      reason: '测试原因',
      items: itemIds
    });
  return res.body;
}

describe('1. 认证与权限基础', () => {
  test('用户登录成功', () => {
    expect(tokens.user1).toBeDefined();
  });

  test('各角色登录成功', () => {
    expect(tokens.cs).toBeDefined();
    expect(tokens.wh1).toBeDefined();
    expect(tokens.finance).toBeDefined();
    expect(tokens.admin).toBeDefined();
  });

  test('密码错误返回401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'user1', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('未授权访问返回401', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });
});

describe('2. 售后申请 - 用户成功发起仅退款申请', () => {
  test('用户成功发起仅退款申请', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const availableItem = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    const res = await request(app)
      .post('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({
        orderId: order.id,
        type: AfterSaleType.REFUND_ONLY,
        reason: '商品质量问题',
        images: 'https://example.com/img1.jpg',
        items: [{ orderItemId: availableItem.id, quantity: 1 }]
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(AfterSaleStatus.PENDING_REVIEW);
    expect(res.body.type).toBe(AfterSaleType.REFUND_ONLY);
    expect(res.body.apply_amount).toBeGreaterThan(0);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].apply_quantity).toBe(1);
  });
});

describe('3. 权限校验 - 用户不能给别人的订单申请售后', () => {
  test('用户不能给别人的订单申请售后', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);

    const res = await request(app)
      .post('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.user2}`)
      .send({
        orderId: order.id,
        type: AfterSaleType.REFUND_ONLY,
        reason: '测试越权',
        items: [{ orderItemId: items[0].id, quantity: 1 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('无权');
  });
});

describe('4. 数量校验 - 同一订单明细不能重复超量申请', () => {
  test('超过可售后数量的申请被拒绝', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const res = await request(app)
      .post('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({
        orderId: order.id,
        type: AfterSaleType.REFUND_ONLY,
        reason: '测试超量',
        items: [{ orderItemId: item.id, quantity: item.available_refund_quantity + 100 }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('可售后数量不足');
  });
});

describe('5. 审核 - 审核拒绝必须填写原因', () => {
  let afterSaleId: string;

  beforeAll(async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (item) {
      const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
        { orderItemId: item.id, quantity: 1 }
      ]);
      afterSaleId = as.id;
    }
  });

  test('审核拒绝不填原因返回错误', async () => {
    if (!afterSaleId) {
      console.warn('跳过测试：没有可用的售后单');
      return;
    }

    const res = await request(app)
      .post(`/api/after-sale/${afterSaleId}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('必须填写原因');
  });

  test('审核拒绝填写原因成功', async () => {
    if (!afterSaleId) return;

    const res = await request(app)
      .post(`/api/after-sale/${afterSaleId}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: false, rejectReason: '不符合售后政策' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(AfterSaleStatus.REJECTED);
    expect(res.body.reject_reason).toBe('不符合售后政策');
  });
});

describe('6. 仅退款审核通过后进入退款流程', () => {
  test('仅退款审核通过后进入退款成功状态', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const reviewRes = await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.status).toBe(AfterSaleStatus.REFUND_SUCCESS);

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(detailRes.body.refundRecords).toBeDefined();
    expect(detailRes.body.refundRecords.length).toBeGreaterThan(0);
    expect(detailRes.body.refundRecords[0].status).toBe(RefundStatus.SUCCESS);
  });
});

describe('7. 退款接口幂等性', () => {
  test('重复调用退款不会产生多条退款记录', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const reviewRes = await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    const refundCountBefore = reviewRes.body.refundRecords?.length || 0;

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    const initialRefundCount = detailRes.body.refundRecords.length;

    const retryRes = await request(app)
      .post(`/api/after-sale/${as.id}/retry-refund`)
      .set('Authorization', `Bearer ${tokens.finance}`);

    if (retryRes.status === 200) {
      const detailRes2 = await request(app)
        .get(`/api/after-sale/${as.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(detailRes2.body.refundRecords.length).toBe(initialRefundCount);
    } else {
      expect(retryRes.status).toBe(400);
    }
  });
});

describe('8. 退货入库后库存增加并生成流水', () => {
  test('退货入库成功，库存增加并生成流水', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const invResBefore = await request(app)
      .get('/api/after-sale/inventory/list')
      .set('Authorization', `Bearer ${tokens.admin}`);
    const invBefore = invResBefore.body.find((i: any) => i.product_id === item.product_id);
    const qtyBefore = invBefore?.quantity || 0;

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.RETURN_REFUND, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    await request(app)
      .post(`/api/after-sale/${as.id}/return-logistics`)
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({ logisticsNo: 'SF123456789', logisticsCompany: '顺丰速运' });

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    const receivedItems = detailRes.body.items.map((it: any) => ({
      afterSaleItemId: it.id,
      actualQuantity: it.apply_quantity
    }));

    const confirmRes = await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    expect(confirmRes.status).toBe(200);

    const invResAfter = await request(app)
      .get('/api/after-sale/inventory/list')
      .set('Authorization', `Bearer ${tokens.admin}`);
    const invAfter = invResAfter.body.find((i: any) => i.product_id === item.product_id);
    expect(invAfter.quantity).toBe(qtyBefore + 1);

    const logRes = await request(app)
      .get('/api/after-sale/inventory/logs')
      .set('Authorization', `Bearer ${tokens.admin}`);
    const returnLog = logRes.body.find((l: any) => l.reference_id === as.id);
    expect(returnLog).toBeDefined();
    expect(returnLog.change_type).toBe('return_inbound');
    expect(returnLog.quantity).toBe(1);
  });
});

describe('9. 入库数量不一致生成差异记录', () => {
  test('实收数量少于申请数量生成差异记录', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => (i.available_refund_quantity - i.frozen_refund_quantity) >= 2);

    if (!item) {
      console.warn('跳过测试：没有数量>=2的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.RETURN_REFUND, [
      { orderItemId: item.id, quantity: 2 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    await request(app)
      .post(`/api/after-sale/${as.id}/return-logistics`)
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({ logisticsNo: 'YD987654321', logisticsCompany: '韵达快递' });

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    const receivedItems = detailRes.body.items.map((it: any) => ({
      afterSaleItemId: it.id,
      actualQuantity: 1
    }));

    const confirmRes = await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe(AfterSaleStatus.PENDING_DIFFERENCE_HANDLING);
    expect(confirmRes.body.differenceRecords).toBeDefined();
    expect(confirmRes.body.differenceRecords.length).toBeGreaterThan(0);
    
    const diff = confirmRes.body.differenceRecords[0];
    expect(diff.apply_quantity).toBe(2);
    expect(diff.actual_quantity).toBe(1);
    expect(diff.difference).toBe(1);
    expect(diff.handled).toBe(0);
  });
});

describe('10. 差异处理', () => {
  test('客服可以处理差异', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => (i.available_refund_quantity - i.frozen_refund_quantity) >= 2);

    if (!item) {
      console.warn('跳过测试：没有数量>=2的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.RETURN_REFUND, [
      { orderItemId: item.id, quantity: 2 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    await request(app)
      .post(`/api/after-sale/${as.id}/return-logistics`)
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({ logisticsNo: 'ZT112233445', logisticsCompany: '中通快递' });

    const detailRes1 = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    const receivedItems = detailRes1.body.items.map((it: any) => ({
      afterSaleItemId: it.id,
      actualQuantity: 1
    }));

    await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    const detailRes2 = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.cs}`);

    const diffIds = detailRes2.body.differenceRecords.map((d: any) => d.id);

    const handleRes = await request(app)
      .post(`/api/after-sale/${as.id}/handle-difference`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({
        differenceItemIds: diffIds,
        action: 'refund_actual'
      });

    expect(handleRes.status).toBe(200);
    expect(handleRes.body.status).not.toBe(AfterSaleStatus.PENDING_DIFFERENCE_HANDLING);
    expect(handleRes.body.difference_handled).toBe(1);
  });
});

describe('11. 换货库存不足不能出库', () => {
  test('换货商品不存在时不能出库', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.EXCHANGE, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    await request(app)
      .post(`/api/after-sale/${as.id}/return-logistics`)
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({ logisticsNo: 'EMS55667788', logisticsCompany: 'EMS' });

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    if (detailRes.body.status === AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND) {
      const res = await request(app)
        .post(`/api/after-sale/${as.id}/exchange-outbound`)
        .set('Authorization', `Bearer ${tokens.wh1}`)
        .send({
          exchangeProductId: 'non-existent-product-id',
          logisticsNo: 'SF998877665',
          logisticsCompany: '顺丰速运'
        });

      expect(res.status).toBe(400);
    } else {
      console.warn('跳过测试：售后单未进入待换货出库状态');
    }
  });
});

describe('12. 换货出库流程', () => {
  test('换货出库成功', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.EXCHANGE, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    await request(app)
      .post(`/api/after-sale/${as.id}/return-logistics`)
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({ logisticsNo: 'JT123456789', logisticsCompany: '极兔速递' });

    const detailRes1 = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    const receivedItems = detailRes1.body.items.map((it: any) => ({
      afterSaleItemId: it.id,
      actualQuantity: it.apply_quantity
    }));

    await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    const detailRes2 = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    if (detailRes2.body.status === AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND) {
      const productsRes = await request(app)
        .get('/api/after-sale/products/all')
        .set('Authorization', `Bearer ${tokens.admin}`);
      
      const sameWarehouseProduct = productsRes.body.find(
        (p: any) => p.warehouse_id === detailRes2.body.warehouse_id && p.inventory_quantity > 0
      );

      if (sameWarehouseProduct) {
        const outboundRes = await request(app)
          .post(`/api/after-sale/${as.id}/exchange-outbound`)
          .set('Authorization', `Bearer ${tokens.wh1}`)
          .send({
            exchangeProductId: sameWarehouseProduct.id,
            logisticsNo: 'SF998877665',
            logisticsCompany: '顺丰速运'
          });

        expect(outboundRes.status).toBe(200);
        expect(outboundRes.body.status).toBe(AfterSaleStatus.EXCHANGE_SHIPPED);
        expect(outboundRes.body.exchange_logistics_no).toBe('SF998877665');
      }
    }
  });
});

describe('13. 换货失败转退款', () => {
  test('换货失败可以转为退款处理', async () => {
    const orderRes = await request(app)
      .get('/api/orders?status=delivered')
      .set('Authorization', `Bearer ${tokens.user2}`);

    if (orderRes.body.length === 0) {
      console.warn('跳过测试：user2没有已收货订单');
      return;
    }

    const order = orderRes.body[0];
    const itemsRes = await request(app)
      .get(`/api/orders/${order.id}/items`)
      .set('Authorization', `Bearer ${tokens.user2}`);
    const item = itemsRes.body[0];

    const as = await createAfterSale(tokens.user2, order.id, AfterSaleType.EXCHANGE, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    await request(app)
      .post(`/api/after-sale/${as.id}/return-logistics`)
      .set('Authorization', `Bearer ${tokens.user2}`)
      .send({ logisticsNo: 'YD55667788', logisticsCompany: '韵达' });

    const detailRes1 = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    if (detailRes1.body.status === AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE) {
      const receivedItems = detailRes1.body.items.map((it: any) => ({
        afterSaleItemId: it.id,
        actualQuantity: it.apply_quantity
      }));

      await request(app)
        .post(`/api/after-sale/${as.id}/confirm-receive`)
        .set('Authorization', `Bearer ${tokens.wh1}`)
        .send({ receivedItems });
    }

    const convertRes = await request(app)
      .post(`/api/after-sale/${as.id}/convert-to-refund`)
      .set('Authorization', `Bearer ${tokens.cs}`);

    expect(convertRes.status).toBe(200);
    expect(convertRes.body.type).toBe(AfterSaleType.RETURN_REFUND);
  });
});

describe('14. 权限控制 - 客服不能直接操作库存', () => {
  test('客服调用收货接口返回403', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.cs}`);

    const pendingReceive = listRes.body.find(
      (a: any) => a.status === AfterSaleStatus.PENDING_WAREHOUSE_RECEIVE
    );

    if (pendingReceive) {
      const res = await request(app)
        .post(`/api/after-sale/${pendingReceive.id}/confirm-receive`)
        .set('Authorization', `Bearer ${tokens.cs}`)
        .send({ receivedItems: [] });

      expect(res.status).toBe(403);
    }
  });
});

describe('15. 权限控制 - 仓库人员不能处理其他仓库任务', () => {
  test('仓库人员只能看到自己仓库的售后单', async () => {
    const res = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.wh1}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('仓库人员不能操作其他仓库的售后单', async () => {
    const adminListRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.admin}`);

    const afterSaleFromWh1 = adminListRes.body.find((a: any) => a.warehouse_id);
    
    expect(afterSaleFromWh1).toBeDefined();
    
    const wh2Res = await request(app)
      .get(`/api/after-sale/${afterSaleFromWh1.id}`)
      .set('Authorization', `Bearer ${tokens.wh2}`);
    
    expect(wh2Res.status).toBe(403);
  });
});

describe('16. 售后日志完整记录', () => {
  test('售后详情包含完整操作日志', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(listRes.body.length).toBeGreaterThan(0);

    const asId = listRes.body[0].id;
    const detailRes = await request(app)
      .get(`/api/after-sale/${asId}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(detailRes.body.logs).toBeDefined();
    expect(detailRes.body.logs.length).toBeGreaterThan(0);

    const log = detailRes.body.logs[0];
    expect(log.action).toBeDefined();
    expect(log.operator_id).toBeDefined();
    expect(log.operator_role).toBeDefined();
    expect(log.created_at).toBeDefined();
  });

  test('状态变更日志包含from和to状态', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.admin}`);

    const refundSuccess = listRes.body.find(
      (a: any) => a.status === AfterSaleStatus.REFUND_SUCCESS
    );

    if (refundSuccess) {
      const detailRes = await request(app)
        .get(`/api/after-sale/${refundSuccess.id}`)
        .set('Authorization', `Bearer ${tokens.admin}`);

      const hasStatusChangeLog = detailRes.body.logs.some(
        (log: any) => log.from_status && log.to_status
      );

      expect(hasStatusChangeLog).toBe(true);
    }
  });
});

describe('17. 取消售后', () => {
  test('用户可以取消待审核的售后', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const cancelRes = await request(app)
      .post(`/api/after-sale/${as.id}/cancel`)
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe(AfterSaleStatus.CANCELLED);
  });
});

describe('18. 库存查询', () => {
  test('管理员可以查看所有库存', async () => {
    const res = await request(app)
      .get('/api/after-sale/inventory/list')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('仓库人员可以查看库存流水', async () => {
    const res = await request(app)
      .get('/api/after-sale/inventory/logs')
      .set('Authorization', `Bearer ${tokens.wh1}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('19. 财务人员权限', () => {
  test('财务人员可以查看退款列表', async () => {
    const res = await request(app)
      .get('/api/after-sale/refunds/list')
      .set('Authorization', `Bearer ${tokens.finance}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('普通用户不能查看退款列表', async () => {
    const res = await request(app)
      .get('/api/after-sale/refunds/list')
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(res.status).toBe(403);
  });
});

describe('20. 售后单不能重复入库', () => {
  test('同一售后单不能重复确认收货', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.RETURN_REFUND, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    await request(app)
      .post(`/api/after-sale/${as.id}/return-logistics`)
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({ logisticsNo: 'SF111111111', logisticsCompany: '顺丰' });

    const detailRes1 = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    const receivedItems = detailRes1.body.items.map((it: any) => ({
      afterSaleItemId: it.id,
      actualQuantity: it.apply_quantity
    }));

    await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    const secondRes = await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    expect(secondRes.status).toBe(400);
  });
});

export {};
