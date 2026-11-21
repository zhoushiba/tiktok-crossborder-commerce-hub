import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, type TestContext } from './helpers';

describe('多币种汇率与换算', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await boot();
  });

  afterAll(async () => {
    await shutdown(ctx);
  });

  it('币种与汇率列表带货币对和反向汇率', async () => {
    const currencies = await ctx.as(ctx.operator.token).get('/api/currencies');
    expect(currencies.body.data.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining(['USD', 'GBP', 'SGD', 'CNY']),
    );

    const rates = await ctx.as(ctx.operator.token).get('/api/currencies/rates');
    const pair = rates.body.data.find((item: { pair: string }) => item.pair === 'USD/CNY');
    expect(pair).toBeTruthy();
    expect(pair.rate).toBeGreaterThan(6);
    expect(pair.inverse).toBeCloseTo(1 / pair.rate, 5);
  });

  it('美元换算人民币使用最新生效汇率', async () => {
    const response = await ctx.as(ctx.operator.token)
      .post('/api/currencies/convert')
      .send({ amountCent: 10000, base: 'USD', quote: 'CNY' });
    expect(response.status).toBe(200);
    expect(response.body.data.amountCent).toBe(Math.round(10000 * response.body.data.rate));
    expect(response.body.data.inverted).toBe(false);
    expect(response.body.data.rateDate).toBeTruthy();
  });

  it('缺少正向汇率时自动使用反向汇率并标记 inverted', async () => {
    const response = await ctx.as(ctx.operator.token)
      .post('/api/currencies/convert')
      .send({ amountCent: 10000, base: 'GBP', quote: 'USD' });
    expect(response.status).toBe(200);
    expect(response.body.data.inverted).toBe(true);
    // 1 GBP ≈ 1/0.788 USD
    expect(response.body.data.amountCent).toBeGreaterThan(10000);
  });

  it('同币种换算汇率为 1 且不查库', async () => {
    const response = await ctx.as(ctx.operator.token)
      .post('/api/currencies/convert')
      .send({ amountCent: 12345, base: 'CNY', quote: 'CNY' });
    expect(response.body.data.rate).toBe(1);
    expect(response.body.data.amountCent).toBe(12345);
  });

  it('新增汇率后立即生效（同一货币对同日期覆盖）', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const created = await ctx.as(ctx.operator.token)
      .post('/api/currencies/rates')
      .send({ baseCurrency: 'USD', quoteCurrency: 'CNY', rate: 7.5, effectiveDate: today, source: 'MANUAL_TEST' });
    expect(created.status).toBe(201);
    expect(created.body.data.rate).toBe(7.5);

    const converted = await ctx.as(ctx.operator.token)
      .post('/api/currencies/convert')
      .send({ amountCent: 10000, base: 'USD', quote: 'CNY', date: today });
    expect(converted.body.data.rate).toBe(7.5);
    expect(converted.body.data.amountCent).toBe(75000);
  });

  it('同币种维护汇率被拒绝', async () => {
    const response = await ctx.as(ctx.operator.token).post('/api/currencies/rates').send({
      baseCurrency: 'CNY',
      quoteCurrency: 'CNY',
      rate: 1,
      effectiveDate: new Date().toISOString().slice(0, 10),
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe(40000);
  });
});
