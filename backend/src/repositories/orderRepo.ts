import { getDb } from '../db';
import type { LogisticsOrder, OrderItem, PlatformOrder } from '../types';

export interface OrderQuery {
  shopId?: number;
  status?: string;
  keyword?: string;
  siteCode?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  /** 只看超时未发货（PAID 且支付超过 48 小时） */
  overdueOnly?: boolean;
}

function buildWhere(q: OrderQuery): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q.shopId) {
    clauses.push('o.shop_id = ?');
    params.push(q.shopId);
  }
  if (q.status) {
    clauses.push('o.status = ?');
    params.push(q.status);
  }
  if (q.siteCode) {
    clauses.push('o.site_code = ?');
    params.push(q.siteCode);
  }
  if (q.keyword) {
    clauses.push('(o.platform_order_id LIKE ? OR o.buyer_name LIKE ?)');
    params.push(`%${q.keyword}%`, `%${q.keyword}%`);
  }
  if (q.from) {
    clauses.push('o.created_at >= ?');
    params.push(`${q.from} 00:00:00`);
  }
  if (q.to) {
    clauses.push('o.created_at <= ?');
    params.push(`${q.to} 23:59:59`);
  }
  if (q.overdueOnly) {
    clauses.push("o.status = 'PAID' AND o.paid_at IS NOT NULL AND o.paid_at < datetime('now', '-48 hour')");
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export const orderRepo = {
  list(q: OrderQuery): { list: (PlatformOrder & { shop_name?: string; item_count: number })[]; total: number } {
    const db = getDb();
    const { sql, params } = buildWhere(q);
    const total = (
      db.prepare(`SELECT COUNT(1) AS c FROM platform_order o ${sql}`).get(...params) as { c: number }
    ).c;
    const list = db
      .prepare(
        `SELECT o.*, s.shop_name,
                (SELECT COUNT(1) FROM platform_order_item i WHERE i.order_id = o.id) AS item_count
           FROM platform_order o
           LEFT JOIN shop s ON s.id = o.shop_id
           ${sql}
          ORDER BY o.created_at DESC, o.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, q.pageSize, (q.page - 1) * q.pageSize);
    return { list: list as (PlatformOrder & { shop_name?: string; item_count: number })[], total };
  },

  findById(id: number): PlatformOrder | undefined {
    return getDb().prepare('SELECT * FROM platform_order WHERE id = ?').get(id) as PlatformOrder | undefined;
  },

  findByShopAndPlatformId(shopId: number, platformOrderId: string): PlatformOrder | undefined {
    return getDb()
      .prepare('SELECT * FROM platform_order WHERE shop_id = ? AND platform_order_id = ?')
      .get(shopId, platformOrderId) as PlatformOrder | undefined;
  },

  items(orderId: number): OrderItem[] {
    return getDb().prepare('SELECT * FROM platform_order_item WHERE order_id = ? ORDER BY id').all(orderId) as OrderItem[];
  },

  statusLogs(orderId: number) {
    return getDb()
      .prepare('SELECT * FROM order_status_log WHERE order_id = ? ORDER BY created_at, id')
      .all(orderId);
  },

  logistics(orderId: number): LogisticsOrder[] {
    return getDb().prepare('SELECT * FROM logistics_order WHERE order_id = ? ORDER BY id').all(orderId) as LogisticsOrder[];
  },

  /** 幂等写入：唯一键冲突直接忽略，返回是否为"新增" */
  insertIfAbsent(input: {
    shopId: number;
    platformOrderId: string;
    status: string;
    buyerName: string | null;
    currencyCode: string;
    totalAmountCent: number;
    exchangeRateId: number | null;
    baseAmountCent: number;
    siteCode: string | null;
    paidAt: string | null;
    createdAt: string;
  }): { inserted: boolean; id: number } {
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO platform_order (shop_id, platform_order_id, status, buyer_name, currency_code, total_amount_cent,
           exchange_rate_id, base_amount_cent, site_code, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (shop_id, platform_order_id) DO NOTHING`,
      )
      .run(
        input.shopId,
        input.platformOrderId,
        input.status,
        input.buyerName,
        input.currencyCode,
        input.totalAmountCent,
        input.exchangeRateId,
        input.baseAmountCent,
        input.siteCode,
        input.paidAt,
        input.createdAt,
      );
    if (info.changes === 0) {
      const existing = this.findByShopAndPlatformId(input.shopId, input.platformOrderId) as PlatformOrder;
      return { inserted: false, id: existing.id };
    }
    return { inserted: true, id: Number(info.lastInsertRowid) };
  },

  insertItem(input: Omit<OrderItem, 'id'>) {
    getDb()
      .prepare(
        `INSERT INTO platform_order_item (order_id, product_id, sku, title, quantity, unit_price_cent, subtotal_cent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.order_id,
        input.product_id,
        input.sku,
        input.title,
        input.quantity,
        input.unit_price_cent,
        input.subtotal_cent,
      );
  },

  addStatusLog(input: { orderId: number; fromStatus: string | null; toStatus: string; source?: string; remark?: string }) {
    getDb()
      .prepare(
        'INSERT INTO order_status_log (order_id, from_status, to_status, source, remark) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.orderId, input.fromStatus, input.toStatus, input.source ?? 'MANUAL', input.remark ?? null);
  },

  updateStatus(id: number, status: string, extra: Partial<{ shippedAt: string; deliveredAt: string }> = {}) {
    const sets = ['status = ?'];
    const params: unknown[] = [status];
    if (extra.shippedAt) {
      sets.push('shipped_at = ?');
      params.push(extra.shippedAt);
    }
    if (extra.deliveredAt) {
      sets.push('delivered_at = ?');
      params.push(extra.deliveredAt);
    }
    params.push(id);
    return getDb().prepare(`UPDATE platform_order SET ${sets.join(', ')} WHERE id = ?`).run(...params).changes;
  },

  applyRefund(id: number, refundStatus: string, refundAmountCent: number) {
    const db = getDb();
    const status = refundStatus === 'APPROVED' ? 'REFUNDED' : 'REFUNDING';
    return db
      .prepare('UPDATE platform_order SET refund_status = ?, refund_amount_cent = ?, status = ? WHERE id = ?')
      .run(refundStatus, refundAmountCent, status, id).changes;
  },

  countByShopAndStatus(): Array<{ shop_id: number; status: string; c: number }> {
    return getDb()
      .prepare('SELECT shop_id, status, COUNT(1) AS c FROM platform_order GROUP BY shop_id, status')
      .all() as Array<{ shop_id: number; status: string; c: number }>;
  },
};
