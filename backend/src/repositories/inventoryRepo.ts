import { getDb } from '../db';
import type { LogisticsOrder } from '../types';

export const inventoryRepo = {
  /** 库存列表：联表取商品标题/SKU/店铺名，可按店铺与低库存过滤 */
  list(filter: { shopId?: number; lowStockOnly?: boolean; keyword?: string } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.shopId) {
      clauses.push('i.shop_id = ?');
      params.push(filter.shopId);
    }
    if (filter.lowStockOnly) {
      clauses.push('i.available_qty < i.safety_qty');
    }
    if (filter.keyword) {
      clauses.push('(p.title LIKE ? OR p.sku LIKE ?)');
      params.push(`%${filter.keyword}%`, `%${filter.keyword}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
      .prepare(
        `SELECT i.*, p.sku, p.title, p.sale_price_cent, p.currency_code, s.shop_name,
                (i.available_qty - i.safety_qty) AS gap_qty
           FROM inventory i
           JOIN product p ON p.id = i.product_id
           LEFT JOIN shop s ON s.id = i.shop_id
           ${where}
          ORDER BY (i.available_qty - i.safety_qty) ASC, i.id`,
      )
      .all(...params);
  },

  findByProductShop(productId: number, shopId: number) {
    return getDb().prepare('SELECT * FROM inventory WHERE product_id = ? AND shop_id = ?').get(productId, shopId);
  },

  adjust(input: { productId: number; shopId: number; availableQty: number; safetyQty?: number; warehouse?: string }): number {
    const db = getDb();
    const existing = this.findByProductShop(input.productId, input.shopId) as { id: number } | undefined;
    if (existing) {
      return db
        .prepare("UPDATE inventory SET available_qty = ?, safety_qty = COALESCE(?, safety_qty), updated_at = datetime('now') WHERE id = ?")
        .run(input.availableQty, input.safetyQty ?? null, existing.id).changes;
    }
    db.prepare(
      `INSERT INTO inventory (product_id, shop_id, available_qty, safety_qty, warehouse)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.productId, input.shopId, input.availableQty, input.safetyQty ?? 10, input.warehouse ?? 'SZX-CROSSBORDER');
    return 1;
  },

  /** 发货扣减：数量不足时返回 false，由服务层转成 409 */
  deduct(productId: number, shopId: number, qty: number): boolean {
    const db = getDb();
    const row = db
      .prepare('SELECT id, available_qty FROM inventory WHERE product_id = ? AND shop_id = ?')
      .get(productId, shopId) as { id: number; available_qty: number } | undefined;
    if (!row || row.available_qty < qty) return false;
    db.prepare("UPDATE inventory SET available_qty = available_qty - ?, updated_at = datetime('now') WHERE id = ?").run(
      qty,
      row.id,
    );
    return true;
  },

  lowStockCount(): number {
    return (
      getDb().prepare('SELECT COUNT(1) AS c FROM inventory WHERE available_qty < safety_qty').get() as { c: number }
    ).c;
  },

  logisticsList(filter: { status?: string; exceptionOnly?: boolean } = {}): LogisticsOrder[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      clauses.push('l.status = ?');
      params.push(filter.status);
    }
    if (filter.exceptionOnly) {
      clauses.push('l.exception_flag = 1');
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
      .prepare(
        `SELECT l.*, o.platform_order_id, s.shop_name
           FROM logistics_order l
           JOIN platform_order o ON o.id = l.order_id
           LEFT JOIN shop s ON s.id = o.shop_id
           ${where} ORDER BY l.id DESC`,
      )
      .all(...params) as LogisticsOrder[];
  },

  createLogistics(input: {
    orderId: number;
    type: 'FIRST_LEG' | 'LAST_LEG';
    carrier: string;
    trackingNo: string;
    origin?: string;
    destination?: string;
  }) {
    const info = getDb()
      .prepare(
        `INSERT INTO logistics_order (order_id, type, carrier, tracking_no, status, origin, destination)
         VALUES (?, ?, ?, ?, 'IN_TRANSIT', ?, ?)`,
      )
      .run(input.orderId, input.type, input.carrier, input.trackingNo, input.origin ?? null, input.destination ?? null);
    return Number(info.lastInsertRowid);
  },

  markLogisticsException(id: number, reason: string): number {
    return getDb()
      .prepare("UPDATE logistics_order SET status = 'EXCEPTION', exception_flag = 1, exception_reason = ? WHERE id = ?")
      .run(reason, id).changes;
  },

  advanceLogistics(id: number, status: string): number {
    return getDb().prepare('UPDATE logistics_order SET status = ? WHERE id = ?').run(status, id).changes;
  },
};
