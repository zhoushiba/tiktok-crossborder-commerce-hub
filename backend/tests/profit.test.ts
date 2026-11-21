import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, type TestContext } from './helpers';
import { productService, estimateFreightCent } from '../src/services/productService';

describe('选品利润测算（跨境成本结构）', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await boot();
  });

  afterAll(async () => {
    await shutdown(ctx);
  });

  it('物流费用按重量分档', () => {
    expect(estimateFreightCent(120)).toBe(2200);
    expect(estimateFreightCent(200)).toBe(2200);
    expect(estimateFreightCent(201)).toBe(3500);
    expect(estimateFreightCent(900)).toBe(5500);
    expect(estimateFreightCent(1500)).toBe(8000);
    expect(estimateFreightCent(9000)).toBe(11000);
  });

  it('人民币商品利润测算结果精确（售价100元/成本40元/350g）', () => {
    const result = productService.calculateProfit({
      salePriceCent: 10000,
      costPriceCent: 4000,
      currencyCode: 'CNY',
      weightG: 350,
      commissionRate: 0.1,
    });
    expect(result.sale_price_cny_cent).toBe(10000);
    expect(result.freight_cny_cent).toBe(3500);
    expect(result.platform_fee_cny_cent).toBe(500);
    expect(result.commission_cny_cent).toBe(1000);
    expect(result.gross_profit_cny_cent).toBe(1000);
    expect(result.gross_margin).toBe(10);
    // 保本价 = (采购 4000 + 物流 3500) / (1 - 平台费 5% - 佣金 10%)
    expect(result.breakeven_price_cent).toBe(8824);
    expect(result.profitable).toBe(true);
  });

  it('美元商品按最新汇率折算成人民币后计算毛利', () => {
    const result = productService.calculateProfit({
      salePriceCent: 2999,
      costPriceCent: 1200,
      currencyCode: 'USD',
      weightG: 350,
      commissionRate: 0.1,
    });
    expect(result.currency_code).toBe('USD');
    expect(result.rate).toBeGreaterThan(6);
    expect(result.sale_price_cny_cent).toBe(Math.round(2999 * result.rate));
    expect(result.gross_profit_cny_cent).toBe(
      result.sale_price_cny_cent - 1200 - result.freight_cny_cent - result.platform_fee_cny_cent - result.commission_cny_cent,
    );
    expect(result.breakdown).toHaveLength(5);
    expect(result.breakdown.map((item) => item.item)).toContain('FREIGHT');
  });

  it('高价物流会导致亏损，profitable 为 false', () => {
    const result = productService.calculateProfit({
      salePriceCent: 5000,
      costPriceCent: 4000,
      currencyCode: 'CNY',
      weightG: 1800,
      commissionRate: 0.1,
      extraCostCent: 2000,
    });
    expect(result.gross_profit_cny_cent).toBeLessThan(0);
    expect(result.profitable).toBe(false);
    expect(result.breakeven_price_cent).toBeGreaterThan(5000);
  });

  it('利润测算接口支持指定已有商品', async () => {
    const response = await ctx.as(ctx.operator.token).post('/api/products/profit-calc').send({ productId: 1 });
    expect(response.status).toBe(200);
    expect(response.body.code).toBe(0);
    expect(response.body.data.breakdown).toHaveLength(5);
    expect(response.body.data.sale_price_cent).toBe(2999);
  });

  it('前端按「元」传参也能算出同样的结果（salePrice/costPrice 别名）', async () => {
    const byYuan = await ctx
      .as(ctx.operator.token)
      .post('/api/products/profit-calc')
      .send({ salePrice: 100, costPrice: 40, weightG: 350, commissionRate: 0.1, currencyCode: 'CNY' });
    expect(byYuan.status).toBe(200);
    // 元会先换算成分，再与 calcent 版本得到一致结果
    expect(byYuan.body.data.sale_price_cent).toBe(10000);
    expect(byYuan.body.data.cost_cny_cent).toBe(4000);
    expect(byYuan.body.data.gross_profit_cny_cent).toBe(1000);
    expect(byYuan.body.data.gross_margin).toBe(10);
    expect(byYuan.body.data.breakeven_price_cent).toBe(8824);
  });
});
