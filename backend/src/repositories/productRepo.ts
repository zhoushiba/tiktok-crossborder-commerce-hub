import { getDb } from '../db';
import type { Product, ProductCost } from '../types';

export interface ProductQuery {
  keyword?: string;
  category?: string;
  status?: string;
  siteCode?: string;
  page: number;
  pageSize: number;
}

function buildWhere(q: ProductQuery): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q.keyword) {
    clauses.push('(title LIKE ? OR sku LIKE ?)');
    params.push(`%${q.keyword}%`, `%${q.keyword}%`);
  }
  if (q.category) {
    clauses.push('category = ?');
    params.push(q.category);
  }
  if (q.status) {
    clauses.push('status = ?');
    params.push(q.status);
  }
  if (q.siteCode) {
    clauses.push('site_code = ?');
    params.push(q.siteCode);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export const productRepo = {
  list(q: ProductQuery): { list: Product[]; total: number } {
    const db = getDb();
    const { sql, params } = buildWhere(q);
    const total = (db.prepare(`SELECT COUNT(1) AS c FROM product ${sql}`).get(...params) as { c: number }).c;
    const list = db
      .prepare(`SELECT * FROM product ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as Product[];
    return { list, total };
  },

  findById(id: number): Product | undefined {
    return getDb().prepare('SELECT * FROM product WHERE id = ?').get(id) as Product | undefined;
  },

  findBySku(sku: string): Product | undefined {
    return getDb().prepare('SELECT * FROM product WHERE sku = ?').get(sku) as Product | undefined;
  },

  costs(productId: number): ProductCost[] {
    return getDb().prepare('SELECT * FROM product_cost WHERE product_id = ? ORDER BY id').all(productId) as ProductCost[];
  },

  create(input: {
    sku: string;
    title: string;
    category: string;
    costPriceCent: number;
    salePriceCent: number;
    currencyCode: string;
    weightG: number;
    volumeCm3?: number | null;
    commissionRate: number;
    shippingMode: string;
    siteCode?: string | null;
    imageUrl?: string | null;
  }) {
    const info = getDb()
      .prepare(
        `INSERT INTO product (sku, title, image_url, category, cost_price_cent, sale_price_cent, currency_code,
           weight_g, volume_cm3, commission_rate, shipping_mode, site_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.sku,
        input.title,
        input.imageUrl ?? `/images/${input.sku.toLowerCase()}.svg`,
        input.category,
        input.costPriceCent,
        input.salePriceCent,
        input.currencyCode,
        input.weightG,
        input.volumeCm3 ?? null,
        input.commissionRate,
        input.shippingMode,
        input.siteCode ?? null,
      );
    return Number(info.lastInsertRowid);
  },

  update(id: number, patch: Partial<Record<string, unknown>>): number {
    const allowed = [
      'title',
      'category',
      'cost_price_cent',
      'sale_price_cent',
      'currency_code',
      'weight_g',
      'volume_cm3',
      'commission_rate',
      'shipping_mode',
      'site_code',
      'status',
    ];
    const keys = Object.keys(patch).filter((key) => allowed.includes(key));
    if (!keys.length) return 0;
    const sql = `UPDATE product SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
    return getDb().prepare(sql).run(...keys.map((key) => patch[key]), id).changes;
  },

  addCost(input: { productId: number; costType: string; amountCent: number; currencyCode?: string; note?: string }) {
    const info = getDb()
      .prepare('INSERT INTO product_cost (product_id, cost_type, amount_cent, currency_code, note) VALUES (?, ?, ?, ?, ?)')
      .run(input.productId, input.costType, input.amountCent, input.currencyCode ?? 'USD', input.note ?? null);
    return Number(info.lastInsertRowid);
  },

  categories(): Array<{ category: string; count: number }> {
    return getDb().prepare('SELECT category, COUNT(1) AS count FROM product GROUP BY category ORDER BY count DESC').all() as Array<{
      category: string;
      count: number;
    }>;
  },
};
