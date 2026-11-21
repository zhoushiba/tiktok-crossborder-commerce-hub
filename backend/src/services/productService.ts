import { productRepo } from '../repositories/productRepo';
import { currencyRepo } from '../repositories/currencyRepo';
import { inventoryRepo } from '../repositories/inventoryRepo';
import { ApiError } from '../utils/response';
import { centsToYuan, convertCents, yuanToCents } from '../utils/money';

/** 跨境物流成本估算（按重量分档，人民币分）：与真实货代报价量级一致，便于利润测算 */
export const FREIGHT_TIERS: Array<{ maxWeightG: number; costCent: number }> = [
  { maxWeightG: 200, costCent: 2200 },
  { maxWeightG: 500, costCent: 3500 },
  { maxWeightG: 1000, costCent: 5500 },
  { maxWeightG: 2000, costCent: 8000 },
  { maxWeightG: Number.MAX_SAFE_INTEGER, costCent: 11000 },
];

/** 平台费用率：TikTok 佣金 2% + 支付通道 1.5% + 联盟服务费 1.5% */
export const PLATFORM_FEE_RATE = 0.05;

export function estimateFreightCent(weightG: number): number {
  const tier = FREIGHT_TIERS.find((item) => weightG <= item.maxWeightG);
  return tier ? tier.costCent : FREIGHT_TIERS[FREIGHT_TIERS.length - 1].costCent;
}

export interface ProfitInput {
  salePriceCent: number;
  costPriceCent: number;
  currencyCode: string;
  weightG: number;
  commissionRate: number;
  /** 手动覆盖汇率（不传则取最新有效汇率） */
  rate?: number;
  extraCostCent?: number;
}

export interface ProfitResult {
  currency_code: string;
  rate: number;
  sale_price_cent: number;
  sale_price_cny_cent: number;
  cost_cny_cent: number;
  freight_cny_cent: number;
  platform_fee_cny_cent: number;
  commission_cny_cent: number;
  extra_cost_cny_cent: number;
  gross_profit_cny_cent: number;
  gross_margin: number;
  net_margin: number;
  breakeven_price_cent: number;
  profitable: boolean;
  breakdown: Array<{ item: string; amountCnyCent: number; ratio: number }>;
}

export const productService = {
  list(query: { keyword?: string; category?: string; status?: string; siteCode?: string; page: number; pageSize: number }) {
    const { list, total } = productRepo.list(query);
    return { list, total, page: query.page, pageSize: query.pageSize };
  },

  detail(id: number) {
    const product = productRepo.findById(id);
    if (!product) {
      throw ApiError.notFound(`商品 ${id} 不存在`);
    }
    return {
      ...product,
      costs: productRepo.costs(id),
      inventory: inventoryRepo.list({ keyword: product.sku }),
      profit: this.calculateProfit({
        salePriceCent: product.sale_price_cent,
        costPriceCent: product.cost_price_cent,
        currencyCode: product.currency_code,
        weightG: product.weight_g,
        commissionRate: product.commission_rate,
      }),
    };
  },

  create(input: {
    sku: string;
    title: string;
    category: string;
    costPrice: number;
    salePrice: number;
    currencyCode: string;
    weightG: number;
    volumeCm3?: number;
    commissionRate?: number;
    shippingMode?: string;
    siteCode?: string;
  }) {
    if (productRepo.findBySku(input.sku)) {
      throw ApiError.conflict(`SKU ${input.sku} 已存在`);
    }
    const id = productRepo.create({
      sku: input.sku,
      title: input.title,
      category: input.category,
      costPriceCent: yuanToCents(input.costPrice),
      salePriceCent: yuanToCents(input.salePrice),
      currencyCode: input.currencyCode,
      weightG: input.weightG,
      volumeCm3: input.volumeCm3 ?? null,
      commissionRate: input.commissionRate ?? 0.1,
      shippingMode: input.shippingMode ?? 'CROSS_BORDER',
      siteCode: input.siteCode ?? null,
    });
    return this.detail(id);
  },

  update(id: number, patch: Record<string, unknown>) {
    const product = productRepo.findById(id);
    if (!product) {
      throw ApiError.notFound(`商品 ${id} 不存在`);
    }
    const normalized: Record<string, unknown> = { ...patch };
    if (typeof patch.costPrice === 'number') {
      normalized.cost_price_cent = yuanToCents(patch.costPrice);
      delete normalized.costPrice;
    }
    if (typeof patch.salePrice === 'number') {
      normalized.sale_price_cent = yuanToCents(patch.salePrice);
      delete normalized.salePrice;
    }
    productRepo.update(id, normalized);
    return this.detail(id);
  },

  removeOrArchive(id: number) {
    const product = productRepo.findById(id);
    if (!product) {
      throw ApiError.notFound(`商品 ${id} 不存在`);
    }
    // 软下架：订单与佣金仍引用该商品，物理删除会破坏历史数据可追溯性
    productRepo.update(id, { status: 'ARCHIVED' });
    return { id, status: 'ARCHIVED' };
  },

  /**
   * 利润测算：售价按汇率折人民币，扣采购成本、跨境头程/尾程物流、平台费用、达人佣金与额外成本，
   * 输出毛利率、净利率与保本价（含全部可变成本）。
   */
  calculateProfit(input: ProfitInput): ProfitResult {
    if (!(input.salePriceCent > 0)) {
      throw ApiError.badRequest('售价必须大于 0');
    }
    if (!(input.weightG > 0)) {
      throw ApiError.badRequest('重量必须大于 0');
    }
    let rate = input.rate;
    let rateInfo: { effective_date: string } | undefined;
    if (rate === undefined) {
      if (input.currencyCode === 'CNY') {
        rate = 1;
      } else {
        const found = currencyRepo.latestRate(input.currencyCode, 'CNY', new Date().toISOString().slice(0, 10));
        if (!found) {
          throw ApiError.notFound(`缺少 ${input.currencyCode}/CNY 汇率，无法测算利润`);
        }
        rate = found.rate;
        rateInfo = found;
      }
    }
    const salePriceCny = convertCents(input.salePriceCent, rate);
    const freightCny = estimateFreightCent(input.weightG);
    const platformFeeCny = Math.round(salePriceCny * PLATFORM_FEE_RATE);
    const commissionCny = Math.round(salePriceCny * input.commissionRate);
    const extraCostCny = input.extraCostCent ?? 0;
    const totalCost = input.costPriceCent + freightCny + platformFeeCny + commissionCny + extraCostCny;
    const grossProfit = salePriceCny - totalCost;
    const grossMargin = salePriceCny > 0 ? grossProfit / salePriceCny : 0;
    const variableCost = input.costPriceCent + freightCny + extraCostCny;
    // 保本价：平台费与佣金按比例随售价变动，故用 (售价*费率) 反解
    const breakeven = Math.ceil(variableCost / (1 - PLATFORM_FEE_RATE - input.commissionRate));
    return {
      currency_code: input.currencyCode,
      rate: Number((rate ?? 1).toFixed(6)),
      sale_price_cent: input.salePriceCent,
      sale_price_cny_cent: salePriceCny,
      cost_cny_cent: input.costPriceCent,
      freight_cny_cent: freightCny,
      platform_fee_cny_cent: platformFeeCny,
      commission_cny_cent: commissionCny,
      extra_cost_cny_cent: extraCostCny,
      gross_profit_cny_cent: grossProfit,
      gross_margin: Number((grossMargin * 100).toFixed(2)),
      net_margin: Number((grossMargin * 100).toFixed(2)),
      breakeven_price_cent: breakeven,
      profitable: grossProfit > 0,
      breakdown: [
        { item: 'SALE_PRICE', amountCnyCent: salePriceCny, ratio: 1 },
        { item: 'COST', amountCnyCent: input.costPriceCent, ratio: Number((input.costPriceCent / salePriceCny).toFixed(4)) },
        { item: 'FREIGHT', amountCnyCent: freightCny, ratio: Number((freightCny / salePriceCny).toFixed(4)) },
        { item: 'PLATFORM_FEE', amountCnyCent: platformFeeCny, ratio: PLATFORM_FEE_RATE },
        { item: 'COMMISSION', amountCnyCent: commissionCny, ratio: input.commissionRate },
      ],
      ...(rateInfo ? { rate_date: rateInfo.effective_date } : {}),
    } as ProfitResult;
  },

  categories() {
    return productRepo.categories();
  },

  /**
   * CSV 导入：逐行校验，单行失败不影响其他行，返回成功/失败明细供前端展示。
   * 表头固定为 sku,title,category,cost_price,sale_price,currency,weight_g,commission_rate,shipping_mode
   */
  importCsv(csv: string, operator: string) {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) {
      throw ApiError.badRequest('CSV 内容为空');
    }
    const header = lines[0].split(',').map((cell) => cell.trim().toLowerCase());
    const required = ['sku', 'title', 'category', 'cost_price', 'sale_price', 'currency', 'weight_g'];
    const missing = required.filter((col) => !header.includes(col));
    if (missing.length) {
      throw ApiError.badRequest(`CSV 缺少必需列：${missing.join(', ')}`);
    }
    const idx = (name: string) => header.indexOf(name);
    const success: string[] = [];
    const errors: Array<{ row: number; sku: string; message: string }> = [];
    lines.slice(1).forEach((line, offset) => {
      const rowNo = offset + 2;
      const cells = line.split(',').map((cell) => cell.trim());
      const sku = cells[idx('sku')] ?? '';
      try {
        if (!sku) throw new Error('sku 不能为空');
        if (productRepo.findBySku(sku)) throw new Error(`SKU ${sku} 已存在`);
        const costPrice = Number(cells[idx('cost_price')]);
        const salePrice = Number(cells[idx('sale_price')]);
        const weightG = Number(cells[idx('weight_g')]);
        const commissionRate = idx('commission_rate') >= 0 ? Number(cells[idx('commission_rate')] || 0.1) : 0.1;
        if (!Number.isFinite(costPrice) || costPrice <= 0) throw new Error('cost_price 必须为大于 0 的数字');
        if (!Number.isFinite(salePrice) || salePrice <= 0) throw new Error('sale_price 必须为大于 0 的数字');
        if (!Number.isFinite(weightG) || weightG <= 0) throw new Error('weight_g 必须为大于 0 的数字');
        productRepo.create({
          sku,
          title: cells[idx('title')] || sku,
          category: cells[idx('category')] || 'UNCATEGORIZED',
          costPriceCent: yuanToCents(costPrice),
          salePriceCent: yuanToCents(salePrice),
          currencyCode: cells[idx('currency')] || 'USD',
          weightG,
          commissionRate,
          shippingMode: idx('shipping_mode') >= 0 ? cells[idx('shipping_mode')] || 'CROSS_BORDER' : 'CROSS_BORDER',
        });
        success.push(sku);
      } catch (error) {
        errors.push({ row: rowNo, sku, message: (error as Error).message });
      }
    });
    return { operator, total: lines.length - 1, successCount: success.length, errorCount: errors.length, success, errors };
  },

  /** 导出选品库为 CSV，含利润测算关键列 */
  exportCsv(): string {
    const { list } = productRepo.list({ page: 1, pageSize: 500 });
    const header = 'sku,title,category,cost_price_cny,sale_price,currency,weight_g,gross_profit_cny,gross_margin';
    const rows = list.map((product) => {
      const profit = this.calculateProfit({
        salePriceCent: product.sale_price_cent,
        costPriceCent: product.cost_price_cent,
        currencyCode: product.currency_code,
        weightG: product.weight_g,
        commissionRate: product.commission_rate,
      });
      return [
        product.sku,
        `"${product.title.replace(/"/g, '""')}"`,
        product.category,
        centsToYuan(product.cost_price_cent),
        centsToYuan(product.sale_price_cent),
        product.currency_code,
        product.weight_g,
        centsToYuan(profit.gross_profit_cny_cent),
        `${profit.gross_margin}%`,
      ].join(',');
    });
    // 前置 BOM，避免 Excel 直接打开时中文列名乱码
    return `\uFEFF${[header, ...rows].join('\n')}`;
  },
};
