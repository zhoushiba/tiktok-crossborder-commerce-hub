import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, type TestContext } from './helpers';
import { addDays, nowUtc } from '../src/utils/datetime';

describe('达人分佣与结算单', () => {
  let ctx: TestContext;
  let settlementId = 0;
  const periodStart = addDays(nowUtc().slice(0, 10), -30);
  const periodEnd = addDays(nowUtc().slice(0, 10), 1);

  beforeAll(async () => {
    ctx = await boot();
  });

  afterAll(async () => {
    await shutdown(ctx);
  });

  it('达人列表带待结佣金与 ROI 指标', async () => {
    const response = await ctx.as(ctx.operator.token).get('/api/affiliates');
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(6);
    const first = response.body.data[0];
    expect(first.handle.startsWith('@')).toBe(true);
    expect(typeof first.pending_commission_yuan).toBe('number');
    expect(first.roi === null || typeof first.roi === 'number').toBe(true);
  });

  it('对已妥投订单计提佣金且幂等', async () => {
    const delivered = await ctx.as(ctx.operator.token).get('/api/orders?status=DELIVERED&pageSize=5');
    const order = delivered.body.data.list[0];

    const first = await ctx.as(ctx.operator.token).post(`/api/affiliates/orders/${order.id}/accrue`).send({});
    expect(first.status).toBe(200);
    const created = first.body.data.created as unknown[];

    const second = await ctx.as(ctx.operator.token).post(`/api/affiliates/orders/${order.id}/accrue`).send({});
    expect(second.body.data.created.length).toBe(0);
    expect(second.body.data.totalYuan).toBe(first.body.data.totalYuan);
    expect(Array.isArray(created)).toBe(true);
  });

  it('按周期生成结算单并汇总 PENDING 佣金', async () => {
    const preview = await ctx.as(ctx.operator.token).get('/api/affiliates/commissions?influencerId=1&status=PENDING');
    expect(preview.body.data.length).toBeGreaterThan(0);

    const created = await ctx.as(ctx.operator.token)
      .post('/api/settlements')
      .send({ influencerId: 1, periodStart, periodEnd, remark: '2026-11 月度结算' });
    expect(created.status).toBe(201);
    settlementId = created.body.data.id;
    expect(created.body.data.items.length).toBe(preview.body.data.length);
    expect(created.body.data.commission_amount_cent).toBeGreaterThan(0);
    expect(created.body.data.base_amount_yuan).toBeGreaterThan(0);
    expect(created.body.data.settlement_no).toMatch(/^ST\d{8}\d{4}$/);
  });

  it('同周期重复生成结算单被拒绝（佣金已锁定）', async () => {
    const response = await ctx.as(ctx.operator.token)
      .post('/api/settlements')
      .send({ influencerId: 1, periodStart, periodEnd });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe(40900);
  });

  it('结算单状态流转：PENDING → APPROVED → PAID，佣金置为已结算', async () => {
    const pending = await ctx.as(ctx.operator.token).patch(`/api/settlements/${settlementId}/status`).send({ status: 'PAID' });
    expect(pending.status).toBe(409);

    const approved = await ctx.as(ctx.operator.token)
      .patch(`/api/settlements/${settlementId}/status`)
      .send({ status: 'APPROVED' });
    expect(approved.body.data.status).toBe('APPROVED');

    const paid = await ctx.as(ctx.operator.token).patch(`/api/settlements/${settlementId}/status`).send({ status: 'PAID' });
    expect(paid.body.data.status).toBe('PAID');
    expect(paid.body.data.paid_at).toBeTruthy();

    const settled = await ctx.as(ctx.operator.token).get('/api/affiliates/commissions?influencerId=1&status=SETTLED');
    expect(settled.body.data.length).toBeGreaterThan(0);
  });

  it('结算汇总按状态分组', async () => {
    const summary = await ctx.as(ctx.operator.token).get('/api/settlements/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data.byStatus).toBeDefined();
    expect(summary.body.data.currentMonth).toMatch(/^\d{4}-\d{2}$/);
  });
});
