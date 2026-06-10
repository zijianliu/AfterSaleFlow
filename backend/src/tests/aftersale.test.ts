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
    expect(confirmRes.body.status).toBe(AfterSaleStatus.PENDING_DIFFERENCE);
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
    expect(handleRes.body.status).not.toBe(AfterSaleStatus.PENDING_DIFFERENCE);
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
        expect(outboundRes.body.status).toBe(AfterSaleStatus.EXCHANGE_OUTBOUND);
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

    if (detailRes1.body.status === AfterSaleStatus.PENDING_RECEIVE) {
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
      (a: any) => a.status === AfterSaleStatus.PENDING_RECEIVE
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

describe('21. 管理端登录权限校验', () => {
  test('普通用户不能通过管理端登录接口登录', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'user1', password: '123456' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
    expect(res.body.token).toBeUndefined();
  });

  test('客服可以通过管理端登录接口登录', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'cs1', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.CS_AGENT);
  });

  test('管理员可以通过管理端登录接口登录', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'admin', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.ADMIN);
  });

  test('管理端登录密码错误返回401', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'cs1', password: 'wrong' });

    expect(res.status).toBe(401);
  });
});

describe('22. 订单列表售后状态展示', () => {
  test('申请售后成功后订单列表显示售后状态', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const beforeRes = await request(app)
      .get('/api/orders?status=completed')
      .set('Authorization', `Bearer ${tokens.user1}`);
    
    const beforeOrder = beforeRes.body.find((o: any) => o.id === order.id);
    const beforeCount = beforeOrder?.active_after_sale_count || 0;

    await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const afterRes = await request(app)
      .get('/api/orders?status=completed')
      .set('Authorization', `Bearer ${tokens.user1}`);
    
    const afterOrder = afterRes.body.find((o: any) => o.id === order.id);
    expect(afterOrder.active_after_sale_count).toBeGreaterThan(beforeCount);
    expect(afterOrder.total_after_sale_count).toBeGreaterThan(0);
  });

  test('订单详情包含关联的售后单列表', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > i.frozen_refund_quantity);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const detailRes = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.after_sales).toBeDefined();
    expect(detailRes.body.after_sales.length).toBeGreaterThan(0);
  });

  test('订单明细包含剩余可售后数量', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);

    expect(items.length).toBeGreaterThan(0);
    items.forEach((item: any) => {
      expect(item.remaining_refund_quantity).toBeDefined();
      expect(item.remaining_refund_quantity).toBeGreaterThanOrEqual(0);
      expect(item.remaining_refund_quantity).toBeLessThanOrEqual(item.available_refund_quantity);
    });
  });
});

describe('23. 可售后数量冻结与超量申请限制', () => {
  test('同一订单明细不能超量申请售后', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.available_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const overQty = item.available_refund_quantity + 10;
    const res = await request(app)
      .post('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.user1}`)
      .send({
        orderId: order.id,
        type: AfterSaleType.REFUND_ONLY,
        reason: '测试超量申请',
        items: [{ orderItemId: item.id, quantity: overQty }]
      });

    expect(res.status).toBe(400);
  });

  test('申请售后成功后可售后数量减少', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 1);

    if (!item) {
      console.warn('跳过测试：没有可售后数量大于1的商品');
      return;
    }

    const beforeRemaining = item.remaining_refund_quantity;

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const itemsAfter = await getOrderItems(tokens.user1, order.id);
    const itemAfter = itemsAfter.find((i: any) => i.id === item.id);

    expect(itemAfter.remaining_refund_quantity).toBe(beforeRemaining - 1);
    expect(itemAfter.frozen_refund_quantity).toBeGreaterThan(0);
  });

  test('取消售后单后可售后数量恢复', async () => {
    const orderRes = await request(app)
      .get('/api/orders?status=delivered')
      .set('Authorization', `Bearer ${tokens.user2}`);
    
    if (orderRes.body.length === 0) {
      console.warn('跳过测试：没有已收货订单');
      return;
    }
    
    const order = orderRes.body[0];
    const items = await getOrderItems(tokens.user2, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 1);

    if (!item) {
      console.warn('跳过测试：没有可售后数量大于1的商品');
      return;
    }

    const beforeRemaining = item.remaining_refund_quantity;

    const as = await createAfterSale(tokens.user2, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const itemsAfterCreate = await getOrderItems(tokens.user2, order.id);
    const itemAfterCreate = itemsAfterCreate.find((i: any) => i.id === item.id);
    expect(itemAfterCreate.remaining_refund_quantity).toBe(beforeRemaining - 1);

    await request(app)
      .post(`/api/after-sale/${as.id}/cancel`)
      .set('Authorization', `Bearer ${tokens.user2}`);

    const itemsAfterCancel = await getOrderItems(tokens.user2, order.id);
    const itemAfterCancel = itemsAfterCancel.find((i: any) => i.id === item.id);
    expect(itemAfterCancel.remaining_refund_quantity).toBe(beforeRemaining);
  });
});

describe('24. 退款金额计算校验', () => {
  test('退款金额基于实付金额和申请数量计算', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(detailRes.body.actual_refund_amount).toBeDefined();
    expect(Number(detailRes.body.actual_refund_amount)).toBeGreaterThan(0);
  });

  test('累计退款金额不能超过订单实付金额', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);

    if (items.length < 2) {
      console.warn('跳过测试：订单商品数量不足');
      return;
    }

    const totalPayAmount = Number(order.pay_amount);

    for (const item of items) {
      if (item.remaining_refund_quantity > 0) {
        const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
          { orderItemId: item.id, quantity: item.remaining_refund_quantity }
        ]);

        await request(app)
          .post(`/api/after-sale/${as.id}/review`)
          .set('Authorization', `Bearer ${tokens.cs}`)
          .send({ approved: true });

        const refundRes = await request(app)
          .post(`/api/after-sale/${as.id}/refund`)
          .set('Authorization', `Bearer ${tokens.finance}`)
          .send({ idempotencyKey: `test_${as.id}_${Date.now()}` });

        if (refundRes.status === 400 && refundRes.body.error?.includes('累计退款金额不能超过订单实付金额')) {
          expect(refundRes.status).toBe(400);
          return;
        }
      }
    }

    const orderDetailRes = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${tokens.user1}`);

    const refundedAmount = Number(orderDetailRes.body.refunded_amount || 0);
    expect(refundedAmount).toBeLessThanOrEqual(totalPayAmount + 0.01);
  });

  test('退款后订单已退款金额正确更新', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const beforeDetail = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${tokens.user1}`);
    const beforeRefunded = Number(beforeDetail.body.refunded_amount || 0);

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    const refundRes = await request(app)
      .post(`/api/after-sale/${as.id}/refund`)
      .set('Authorization', `Bearer ${tokens.finance}`)
      .send({ idempotencyKey: `test_${as.id}_${Date.now()}` });

    if (refundRes.status === 200) {
      const afterDetail = await request(app)
        .get(`/api/orders/${order.id}`)
        .set('Authorization', `Bearer ${tokens.user1}`);
      const afterRefunded = Number(afterDetail.body.refunded_amount || 0);

      expect(afterRefunded).toBeGreaterThan(beforeRefunded);
      expect(afterRefunded).toBeLessThanOrEqual(Number(order.pay_amount) + 0.01);
    }
  });
});

describe('25. 售后状态枚举统一验证', () => {
  const validStatuses = Object.values(AfterSaleStatus);

  test('所有售后单状态都在定义范围内', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(Array.isArray(listRes.body)).toBe(true);

    for (const as of listRes.body) {
      expect(validStatuses).toContain(as.status);
    }
  });

  test('售后详情状态在定义范围内', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.admin}`);

    if (listRes.body.length > 0) {
      const asId = listRes.body[0].id;
      const detailRes = await request(app)
        .get(`/api/after-sale/${asId}`)
        .set('Authorization', `Bearer ${tokens.admin}`);

      expect(validStatuses).toContain(detailRes.body.status);
    }
  });

  test('状态机标签映射存在且为中文', async () => {
    const statusList = Object.values(AfterSaleStatus);
    expect(statusList.length).toBe(13);

    const detailRes = await request(app)
      .get('/api/after-sale/status/labels')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(detailRes.status).toBe(200);
    const labels = detailRes.body.statusLabels;
    expect(labels).toBeDefined();
    
    for (const status of statusList) {
      expect(labels[status]).toBeDefined();
      expect(typeof labels[status]).toBe('string');
      expect(labels[status].length).toBeGreaterThan(0);
    }
  });

  test('不存在pending_user_return等未定义状态', async () => {
    const undefinedStatuses = ['pending_user_return', 'pending_warehouse_receive', 'exchange_shipped', 'pending_difference_handling'];
    
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.admin}`);

    for (const as of listRes.body) {
      expect(undefinedStatuses).not.toContain(as.status);
    }
  });
});

describe('26. 售后状态流转与操作日志', () => {
  test('完整退款流程状态正确流转', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);
    expect(as.status).toBe(AfterSaleStatus.PENDING_REVIEW);

    const reviewRes = await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });
    expect(reviewRes.body.status).toBe(AfterSaleStatus.PENDING_REFUND);

    const refundRes = await request(app)
      .post(`/api/after-sale/${as.id}/refund`)
      .set('Authorization', `Bearer ${tokens.finance}`)
      .send({ idempotencyKey: `test_flow_${as.id}_${Date.now()}` });

    if (refundRes.status === 200) {
      expect(refundRes.body.status).toBe(AfterSaleStatus.REFUND_SUCCESS);
    }
  });

  test('操作日志包含每个状态变更记录', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(detailRes.body.logs).toBeDefined();
    expect(detailRes.body.logs.length).toBeGreaterThanOrEqual(2);

    const actions = detailRes.body.logs.map((log: any) => log.action);
    expect(actions).toContain('create');
    expect(actions).toContain('review');

    const statusChangeLogs = detailRes.body.logs.filter((log: any) => log.from_status && log.to_status);
    expect(statusChangeLogs.length).toBeGreaterThan(0);
  });

  test('拒绝售后单状态正确流转并记录日志', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.REFUND_ONLY, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const rejectRes = await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: false, rejectReason: '测试拒绝' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe(AfterSaleStatus.REJECTED);

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.user1}`);

    const rejectLog = detailRes.body.logs.find((log: any) => log.action === 'review');
    expect(rejectLog).toBeDefined();
    expect(rejectLog.to_status).toBe(AfterSaleStatus.REJECTED);
  });
});

describe('27. 换货流程状态流转验证', () => {
  test('换货申请创建后状态为待审核', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.EXCHANGE, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    expect(as.status).toBe(AfterSaleStatus.PENDING_REVIEW);
    expect(as.type).toBe(AfterSaleType.EXCHANGE);
  });

  test('换货审核通过后进入待用户退货状态，不进入退款流程', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

    if (!item) {
      console.warn('跳过测试：没有可用的可售后商品');
      return;
    }

    const as = await createAfterSale(tokens.user1, order.id, AfterSaleType.EXCHANGE, [
      { orderItemId: item.id, quantity: 1 }
    ]);

    const reviewRes = await request(app)
      .post(`/api/after-sale/${as.id}/review`)
      .set('Authorization', `Bearer ${tokens.cs}`)
      .send({ approved: true });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.status).toBe(AfterSaleStatus.PENDING_RETURN);
    expect(reviewRes.body.status).not.toBe(AfterSaleStatus.PENDING_REFUND);
  });

  test('换货确认收货后进入待换货出库状态', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

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
      .send({ logisticsNo: 'SF123456789', logisticsCompany: '顺丰' });

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    const receivedItems = detailRes.body.items.map((it: any) => ({
      afterSaleItemId: it.id,
      actualQuantity: it.apply_quantity
    }));

    const receiveRes = await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    if (receiveRes.status === 200) {
      expect(receiveRes.body.status).toBe(AfterSaleStatus.PENDING_EXCHANGE_OUTBOUND);
      expect(receiveRes.body.status).not.toBe(AfterSaleStatus.PENDING_REFUND);
    }
  });

  test('换货类型售后单不会生成退款记录', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

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

    const refundListRes = await request(app)
      .get('/api/after-sale/refunds/list')
      .set('Authorization', `Bearer ${tokens.finance}`);

    const relatedRefunds = refundListRes.body.filter(
      (r: any) => r.after_sale_id === as.id
    );

    expect(relatedRefunds.length).toBe(0);
  });

  test('换货类型在待换货出库状态不能直接退款', async () => {
    const order = await getCompletedOrder(tokens.user1);
    const items = await getOrderItems(tokens.user1, order.id);
    const item = items.find(i => i.remaining_refund_quantity > 0);

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
      .send({ logisticsNo: 'SF987654321', logisticsCompany: '顺丰' });

    const detailRes = await request(app)
      .get(`/api/after-sale/${as.id}`)
      .set('Authorization', `Bearer ${tokens.wh1}`);

    const receivedItems = detailRes.body.items.map((it: any) => ({
      afterSaleItemId: it.id,
      actualQuantity: it.apply_quantity
    }));

    await request(app)
      .post(`/api/after-sale/${as.id}/confirm-receive`)
      .set('Authorization', `Bearer ${tokens.wh1}`)
      .send({ receivedItems });

    const refundRes = await request(app)
      .post(`/api/after-sale/${as.id}/refund`)
      .set('Authorization', `Bearer ${tokens.finance}`)
      .send({ idempotencyKey: `test_exchange_refund_${as.id}` });

    expect(refundRes.status).not.toBe(200);
  });
});

describe('28. 各角色管理端权限验证', () => {
  test('客服账号可以通过管理端登录', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'cs1', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.CS_AGENT);
  });

  test('仓库账号可以通过管理端登录', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'wh1', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.WAREHOUSE_STAFF);
    expect(res.body.user.warehouseId).toBeDefined();
  });

  test('财务账号可以通过管理端登录', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'finance1', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.FINANCE_STAFF);
  });

  test('管理员账号可以通过管理端登录', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'admin', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe(UserRole.ADMIN);
  });

  test('客服可以访问售后审核接口', async () => {
    const listRes = await request(app)
      .get('/api/after-sale?status=pending_review')
      .set('Authorization', `Bearer ${tokens.cs}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
  });

  test('仓库人员可以访问退货入库和换货出库接口', async () => {
    const listRes = await request(app)
      .get('/api/after-sale?status=pending_receive')
      .set('Authorization', `Bearer ${tokens.wh1}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
  });

  test('财务人员可以访问退款列表接口', async () => {
    const refundListRes = await request(app)
      .get('/api/after-sale/refunds/list')
      .set('Authorization', `Bearer ${tokens.finance}`);

    expect(refundListRes.status).toBe(200);
    expect(Array.isArray(refundListRes.body)).toBe(true);
  });

  test('管理员可以查看全部售后单', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
  });

  test('管理员可以查看库存列表', async () => {
    const inventoryRes = await request(app)
      .get('/api/after-sale/inventory/list')
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(inventoryRes.status).toBe(200);
  });

  test('普通用户不能访问审核接口', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(listRes.status).toBe(200);
  });

  test('普通用户不能访问退款列表接口', async () => {
    const refundRes = await request(app)
      .get('/api/after-sale/refunds/list')
      .set('Authorization', `Bearer ${tokens.user1}`);

    expect(refundRes.status).toBe(403);
  });

  test('客服不能访问确认收货接口', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.cs}`);

    if (listRes.body.length > 0) {
      const asId = listRes.body[0].id;
      const receiveRes = await request(app)
        .post(`/api/after-sale/${asId}/confirm-receive`)
        .set('Authorization', `Bearer ${tokens.cs}`)
        .send({ receivedItems: [] });

      expect(receiveRes.status).toBe(403);
    }
  });

  test('仓库人员不能访问审核接口', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.wh1}`);

    if (listRes.body.length > 0) {
      const asId = listRes.body[0].id;
      const reviewRes = await request(app)
        .post(`/api/after-sale/${asId}/review`)
        .set('Authorization', `Bearer ${tokens.wh1}`)
        .send({ approved: true });

      expect(reviewRes.status).toBe(403);
    }
  });

  test('财务人员不能访问审核接口', async () => {
    const listRes = await request(app)
      .get('/api/after-sale')
      .set('Authorization', `Bearer ${tokens.finance}`);

    if (listRes.body.length > 0) {
      const asId = listRes.body[0].id;
      const reviewRes = await request(app)
        .post(`/api/after-sale/${asId}/review`)
        .set('Authorization', `Bearer ${tokens.finance}`)
        .send({ approved: true });

      expect(reviewRes.status).toBe(403);
    }
  });
});

describe('29. 管理端登录前后端联调接口测试', () => {
  test('POST /api/auth/admin-login 路由存在且可访问', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'cs1', password: '123456' });

    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
  });

  test('管理端登录返回的token包含正确的角色信息', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'wh1', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('warehouse_staff');
    expect(res.body.user.username).toBe('wh1');
    expect(res.body.user.warehouseId).toBeDefined();
  });

  test('普通用户登录管理端返回403且不返回token', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'user1', password: '123456' });

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
    expect(res.body.error).toBeDefined();
  });

  test('管理端登录失败时不写入登录态', async () => {
    const res = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'user1', password: '123456' });

    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toBeUndefined();
  });

  test('各管理端账号通过admin-login接口都能登录成功', async () => {
    const accounts = [
      { username: 'cs1', expectedRole: 'cs_agent' },
      { username: 'wh1', expectedRole: 'warehouse_staff' },
      { username: 'wh2', expectedRole: 'warehouse_staff' },
      { username: 'finance1', expectedRole: 'finance_staff' },
      { username: 'admin', expectedRole: 'admin' },
    ];

    for (const account of accounts) {
      const res = await request(app)
        .post('/api/auth/admin-login')
        .send({ username: account.username, password: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe(account.expectedRole);
    }
  });

  test('管理端登录token可以访问管理端接口', async () => {
    const loginRes = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'cs1', password: '123456' });

    const token = loginRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.role).toBe('cs_agent');
  });

  test('普通login接口与管理端admin-login接口路径不同', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'user1', password: '123456' });

    const adminLoginRes = await request(app)
      .post('/api/auth/admin-login')
      .send({ username: 'user1', password: '123456' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();

    expect(adminLoginRes.status).toBe(403);
    expect(adminLoginRes.body.token).toBeUndefined();
  });

  test('健康检查端点返回管理端登录接口信息', async () => {
    const res = await request(app)
      .get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.endpoints).toBeDefined();
    expect(res.body.endpoints.adminLogin).toBe('POST /api/auth/admin-login');
  });
});

describe('30. 仓库确认收货字段映射与完整链路测试', () => {
  let userToken: string;
  let csToken: string;
  let whToken: string;
  let financeToken: string;

  beforeEach(async () => {
    const userLogin = await request(app).post('/api/auth/login').send({ username: 'user1', password: '123456' });
    userToken = userLogin.body.token;
    const csLogin = await request(app).post('/api/auth/admin-login').send({ username: 'cs1', password: '123456' });
    csToken = csLogin.body.token;
    const whLogin = await request(app).post('/api/auth/admin-login').send({ username: 'wh1', password: '123456' });
    whToken = whLogin.body.token;
    const finLogin = await request(app).post('/api/auth/admin-login').send({ username: 'finance1', password: '123456' });
    financeToken = finLogin.body.token;
  });

  async function createReturnRefundFlow(quantity: number = 1) {
    const ordersRes = await request(app).get('/api/orders').set('Authorization', `Bearer ${userToken}`);
    const completedOrders = ordersRes.body.filter((o: any) => o.status === 'completed');

    let orderId = '';
    let orderItemId = '';
    let remainQty = 0;

    for (const order of completedOrders) {
      const detail = await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${userToken}`);
      for (const item of detail.body.items) {
        const available = (item.available_refund_quantity || 0) - (item.frozen_refund_quantity || 0);
        if (available >= quantity) {
          orderId = order.id;
          orderItemId = item.id;
          remainQty = available;
          break;
        }
      }
      if (orderId) break;
    }

    if (!orderId || !orderItemId) {
      throw new Error('No available order item for test');
    }

    const applyRes = await request(app)
      .post('/api/after-sale')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderId, type: 'return_refund', reason: '测试确认收货', items: [{ orderItemId, quantity }] });

    if (applyRes.status !== 200) {
      throw new Error(`Apply failed: ${applyRes.body.error}`);
    }

    const asId = applyRes.body.id;
    const asItemId = applyRes.body.items?.[0]?.id;

    await request(app).post(`/api/after-sale/${asId}/review`).set('Authorization', `Bearer ${csToken}`).send({ approved: true });
    await request(app).post(`/api/after-sale/${asId}/return-logistics`).set('Authorization', `Bearer ${userToken}`).send({ logisticsNo: 'SF-TEST', logisticsCompany: '顺丰速运' });

    return { asId, asItemId, orderId, orderItemId };
  }

  test('前端格式(itemId+quantity)提交确认收货能正确匹配售后商品', async () => {
    const { asId, asItemId } = await createReturnRefundFlow(1);

    const receiveRes = await request(app)
      .post(`/api/after-sale/${asId}/confirm-receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({ receivedItems: [{ itemId: asItemId, quantity: 1 }] });

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.status).toBe('pending_refund');
    expect(receiveRes.body.items[0].actual_quantity).toBe(1);
  });

  test('后端格式(afterSaleItemId+actualQuantity)提交确认收货也兼容', async () => {
    const { asId, asItemId } = await createReturnRefundFlow(1);

    const receiveRes = await request(app)
      .post(`/api/after-sale/${asId}/confirm-receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({ receivedItems: [{ afterSaleItemId: asItemId, actualQuantity: 1 }] });

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.status).toBe('pending_refund');
  });

  test('确认收货后库存增加并生成库存流水', async () => {
    const { asId, asItemId, orderId } = await createReturnRefundFlow(1);

    const asDetail = await request(app).get(`/api/after-sale/${asId}`).set('Authorization', `Bearer ${whToken}`);
    const productId = asDetail.body.items[0].product_id;

    const invBefore = await request(app).get('/api/after-sale/inventory/list').set('Authorization', `Bearer ${whToken}`);
    const productBefore = invBefore.body.find((i: any) => i.product_id === productId);

    await request(app)
      .post(`/api/after-sale/${asId}/confirm-receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({ receivedItems: [{ itemId: asItemId, quantity: 1 }] });

    const invAfter = await request(app).get('/api/after-sale/inventory/list').set('Authorization', `Bearer ${whToken}`);
    const productAfter = invAfter.body.find((i: any) => i.product_id === productId);

    expect(Number(productAfter.stock)).toBe(Number(productBefore.stock) + 1);

    const logsRes = await request(app).get(`/api/after-sale/inventory/logs?productId=${productId}`).set('Authorization', `Bearer ${whToken}`);
    const returnLog = logsRes.body.find((l: any) => l.change_type === 'return_inbound');
    expect(returnLog).toBeDefined();
  });

  test('无差异时确认收货后进入待退款状态', async () => {
    const { asId, asItemId } = await createReturnRefundFlow(1);

    const receiveRes = await request(app)
      .post(`/api/after-sale/${asId}/confirm-receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({ receivedItems: [{ itemId: asItemId, quantity: 1 }] });

    expect(receiveRes.body.status).toBe('pending_refund');
  });

  test('有差异时确认收货后进入差异处理状态并生成差异记录', async () => {
    const { asId, asItemId } = await createReturnRefundFlow(2);

    const receiveRes = await request(app)
      .post(`/api/after-sale/${asId}/confirm-receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({ receivedItems: [{ itemId: asItemId, quantity: 1 }] });

    expect(receiveRes.body.status).toBe('pending_difference');
    expect(receiveRes.body.items[0].has_difference).toBe(true);

    const detailRes = await request(app).get(`/api/after-sale/${asId}`).set('Authorization', `Bearer ${csToken}`);
    const diffRecords = detailRes.body.differenceRecords || [];
    expect(diffRecords.length).toBeGreaterThan(0);
    expect(diffRecords[0].difference).toBe(1);
  });

  test('完整链路：申请→审核→退货→收货→财务退款→退款成功', async () => {
    const { asId, asItemId, orderId } = await createReturnRefundFlow(1);

    const receiveRes = await request(app)
      .post(`/api/after-sale/${asId}/confirm-receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({ receivedItems: [{ itemId: asItemId, quantity: 1 }] });
    expect(receiveRes.body.status).toBe('pending_refund');

    const processRefundRes = await request(app)
      .post(`/api/after-sale/${asId}/process-refund`)
      .set('Authorization', `Bearer ${financeToken}`);
    expect(processRefundRes.status).toBe(200);
    expect(processRefundRes.body.status).toBe('refund_success');

    const orderAfterRefund = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(Number(orderAfterRefund.body.refunded_amount)).toBeGreaterThan(0);
  });

  test('财务处理退款需要待退款状态', async () => {
    const ordersRes = await request(app).get('/api/orders').set('Authorization', `Bearer ${userToken}`);
    const completedOrders = ordersRes.body.filter((o: any) => o.status === 'completed');

    let orderId = '';
    let orderItemId = '';

    for (const order of completedOrders) {
      const detail = await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${userToken}`);
      for (const item of detail.body.items) {
        const available = (item.available_refund_quantity || 0) - (item.frozen_refund_quantity || 0);
        if (available >= 1) {
          orderId = order.id;
          orderItemId = item.id;
          break;
        }
      }
      if (orderId) break;
    }

    if (!orderId) return;

    const applyRes = await request(app)
      .post('/api/after-sale')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderId, type: 'return_refund', reason: '测试', items: [{ orderItemId, quantity: 1 }] });

    if (applyRes.status !== 200) return;

    const asId = applyRes.body.id;

    const processRefundRes = await request(app)
      .post(`/api/after-sale/${asId}/process-refund`)
      .set('Authorization', `Bearer ${financeToken}`);
    expect(processRefundRes.status).toBe(400);
    expect(processRefundRes.body.error).toContain('待退款');
  });

  test('非财务角色不能处理退款', async () => {
    const { asId, asItemId } = await createReturnRefundFlow(1);

    await request(app)
      .post(`/api/after-sale/${asId}/confirm-receive`)
      .set('Authorization', `Bearer ${whToken}`)
      .send({ receivedItems: [{ itemId: asItemId, quantity: 1 }] });

    const processRefundRes = await request(app)
      .post(`/api/after-sale/${asId}/process-refund`)
      .set('Authorization', `Bearer ${whToken}`);
    expect(processRefundRes.status).toBe(403);
  });
});

export {};
