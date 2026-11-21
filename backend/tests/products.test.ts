import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, type TestContext } from './helpers';

const CSV_HEADER = 'sku,title,category,cost_price,sale_price,currency,weight_g,commission_rate,shipping_mode';

describe('选品库（CSV 导入导出 / 校验）', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await boot();
  });

  afterAll(async () => {
    await shutdown(ctx);
  });

  it('商品分页列表与类目聚合', async () => {
    const list = await ctx.as(ctx.operator.token).get('/api/products?page=1&pageSize=5');
    expect(list.body.data.total).toBeGreaterThanOrEqual(12);
    expect(list.body.data.list).toHaveLength(5);

    const categories = await ctx.as(ctx.operator.token).get('/api/products/categories');
    expect(categories.body.data.length).toBeGreaterThan(0);
    expect(categories.body.data[0].category).toBeTruthy();
    expect(categories.body.data[0].count).toBeGreaterThan(0);
  });

  it('CSV 导入逐行容错：成功 1 行，错误 2 行并给出原因', async () => {
    const csv = [
      CSV_HEADER,
      'TT-TEST-9001,Test Silicone Case,3C配件,3.5,12.9,USD,120,0.08,CROSS_BORDER',
      'TT-BEAUTY-001,Duplicate SKU,美妆,4,15,USD,300,0.1,FBA',
      'TT-TEST-9002,Bad Cost,美妆,abc,15,USD,300,0.1,FBA',
    ].join('\n');

    const response = await ctx.as(ctx.operator.token).post('/api/products/import').send({ csv, fileName: 'products.csv' });
    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.successCount).toBe(1);
    expect(response.body.data.errorCount).toBe(2);
    expect(response.body.data.success).toContain('TT-TEST-9001');
    expect(response.body.data.errors[0].row).toBe(3);
    expect(response.body.data.errors[0].message).toContain('已存在');
    expect(response.body.data.errors[1].message).toContain('cost_price');

    const created = await ctx.as(ctx.operator.token).get('/api/products?keyword=TT-TEST-9001');
    expect(created.body.data.total).toBe(1);
  });

  it('CSV 缺少必需列直接返回 400', async () => {
    const response = await ctx.as(ctx.operator.token).post('/api/products/import').send({ csv: 'sku,title\nA,B' });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain('CSV 缺少必需列');
  });

  it('导出 CSV 带 BOM、毛利列与全部商品', async () => {
    const response = await ctx.as(ctx.operator.token).get('/api/products/export.csv');
    expect(response.status).toBe(200);
    expect(response.text.startsWith('\uFEFF')).toBe(true);
    expect(response.text).toContain('gross_margin');
    expect(response.text.split('\n').length).toBeGreaterThanOrEqual(13);
  });

  it('新建商品校验价格与 SKU 唯一性', async () => {
    const invalid = await ctx.as(ctx.operator.token).post('/api/products').send({
      sku: 'TT-NEW-1',
      title: '测试商品',
      category: '美妆',
      costPrice: 0,
      salePrice: 10,
      currencyCode: 'USD',
      weightG: 200,
    });
    expect(invalid.status).toBe(400);

    const created = await ctx.as(ctx.operator.token).post('/api/products').send({
      sku: 'TT-NEW-2',
      title: '测试新品',
      category: '美妆',
      costPrice: 3.2,
      salePrice: 19.9,
      currencyCode: 'USD',
      weightG: 260,
      commissionRate: 0.12,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.cost_price_cent).toBe(320);
    expect(created.body.data.sale_price_cent).toBe(1990);

    const duplicated = await ctx.as(ctx.operator.token).post('/api/products').send({
      sku: 'TT-NEW-2',
      title: '重复 SKU',
      category: '美妆',
      costPrice: 3.2,
      salePrice: 19.9,
      currencyCode: 'USD',
      weightG: 260,
    });
    expect(duplicated.status).toBe(409);
  });

  it('商品详情包含成本明细、库存与利润测算', async () => {
    const response = await ctx.as(ctx.operator.token).get('/api/products/1');
    expect(response.status).toBe(200);
    expect(response.body.data.sku).toBe('TT-BEAUTY-001');
    expect(response.body.data.profit.gross_margin).toBeGreaterThan(0);
    expect(Array.isArray(response.body.data.costs)).toBe(true);
  });

  it('删除商品为软下架（状态置 ARCHIVED）', async () => {
    const response = await ctx.as(ctx.operator.token).del('/api/products/5');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ARCHIVED');
  });
});
