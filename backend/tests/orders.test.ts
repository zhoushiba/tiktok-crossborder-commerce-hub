import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, type TestContext } from './helpers';

describe('订单同步与履约状态机', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await boot();
  });

  afterAll(async () => {
    await shutdown(ctx);
  });

  it('从 Mock 网关同步订单：游标分页拉完并幂等去重', async () => {
    const response = await ctx.as(ctx.operator.token).post('/api/orders/sync').send({ shopId: 1 });
    expect(response.status).toBe(200);
    const [result] = response.body.data as Array<{
      shopId: number;
      fetched: number;
      inserted: number;
      duplicated: number;
      pages: number;
    }>;
    expect(result.shopId).toBe(1);
    expect(result.pages).toBeGreaterThanOrEqual(2);
    expect(result.inserted).toBeGreaterThan(0);
    // Mock 网关会在后续分页里重复返回订单，验证幂等键 shop_id + platform_order_id
    expect(result.duplicated).toBeGreaterThan(0);
    expect(result.fetched).toBe(result.inserted + result.duplicated);
  });

  it('重复同步不会产生重复订单', async () => {
    const before = await ctx.as(ctx.operator.token).get('/api/orders?shopId=1&pageSize=100');
    const beforeTotal = before.body.data.total as number;

    const again = await ctx.as(ctx.operator.token).post('/api/orders/sync').send({ shopId: 1 });
    const [result] = again.body.data as Array<{ inserted: number; duplicated: number }>;
    expect(result.inserted).toBe(0);
    expect(result.duplicated).toBeGreaterThan(0);

    const after = await ctx.as(ctx.operator.token).get('/api/orders?shopId=1&pageSize=100');
    expect(after.body.data.total).toBe(beforeTotal);
  });

  it('订单列表支持状态过滤并附带金额双币种字段', async () => {
    const response = await ctx.as(ctx.operator.token).get('/api/orders?status=PAID&pageSize=50');
    expect(response.status).toBe(200);
    expect(response.body.data.list.length).toBeGreaterThan(0);
    for (const order of response.body.data.list) {
      expect(order.status).toBe('PAID');
      expect(typeof order.total_amount_yuan).toBe('number');
      expect(typeof order.base_amount_yuan).toBe('number');
      expect(order.shop_name).toBeTruthy();
    }
  });

  it('发货 → 妥投 → 退货退款全链路', async () => {
    const paid = await ctx.as(ctx.operator.token).get('/api/orders?status=PAID&pageSize=5');
    const target = paid.body.data.list[0];

    const shipped = await ctx.as(ctx.operator.token)
      .post(`/api/orders/${target.id}/ship`)
      .send({ carrier: 'YunExpress', trackingNo: 'YT20261122001', deductInventory: false });
    expect(shipped.status).toBe(200);
    expect(shipped.body.data.status).toBe('SHIPPED');
    expect(shipped.body.data.shipped_at).toBeTruthy();
    expect(shipped.body.data.logistics.length).toBeGreaterThan(0);
    expect(shipped.body.data.logistics[0].tracking_no).toBe('YT20261122001');

    const delivered = await ctx.as(ctx.operator.token).post(`/api/orders/${target.id}/delivery`).send({});
    expect(delivered.body.data.status).toBe('DELIVERED');
    expect(delivered.body.data.delivered_at).toBeTruthy();

    const refunded = await ctx.as(ctx.operator.token)
      .post(`/api/orders/${target.id}/refund`)
      .send({ refundStatus: 'APPROVED', refundAmountYuan: 10, reason: '客户尺码不符' });
    expect(refunded.body.data.status).toBe('REFUNDED');
  });

  it('非法状态流转返回 409', async () => {
    const delivered = await ctx.as(ctx.operator.token).get('/api/orders?status=DELIVERED&pageSize=5');
    const target = delivered.body.data.list[0];
    const response = await ctx.as(ctx.operator.token).post(`/api/orders/${target.id}/ship`).send({});
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(40900);

    const sameStatus = await ctx.as(ctx.operator.token).patch(`/api/orders/${target.id}/status`).send({ status: 'DELIVERED' });
    expect(sameStatus.status).toBe(409);
  });

  it('退款金额不能超过订单金额', async () => {
    const shipped = await ctx.as(ctx.operator.token).get('/api/orders?status=SHIPPED&pageSize=5');
    const target = shipped.body.data.list[0];
    const response = await ctx.as(ctx.operator.token)
      .post(`/api/orders/${target.id}/refund`)
      .send({ refundStatus: 'REQUESTED', refundAmountYuan: 999999 });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('退款金额');
  });

  it('订单导出 CSV 带 BOM 与中文表头', async () => {
    const response = await ctx.as(ctx.operator.token).get('/api/orders/export.csv?pageSize=10');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text.startsWith('\uFEFF')).toBe(true);
    expect(response.text).toContain('订单号');
    expect(response.text.split('\n').length).toBeGreaterThan(1);
  });

  it('超时未发货与低库存待办可查询', async () => {
    const overdue = await ctx.as(ctx.operator.token).get('/api/orders/overdue');
    expect(overdue.status).toBe(200);
    expect(Array.isArray(overdue.body.data)).toBe(true);

    const lowStock = await ctx.as(ctx.operator.token).get('/api/inventory/low-stock');
    expect(lowStock.body.data.list.length).toBeGreaterThan(0);
    expect(lowStock.body.data.count).toBe(lowStock.body.data.list.length);
    expect(lowStock.body.data.list[0].available_qty).toBeLessThan(lowStock.body.data.list[0].safety_qty);
  });
});
