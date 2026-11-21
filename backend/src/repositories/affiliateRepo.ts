import { getDb } from '../db';
import type { AffiliateLink, CommissionRecord, Influencer } from '../types';

export const affiliateRepo = {
  listInfluencers(filter: { keyword?: string; region?: string; status?: string } = {}): Influencer[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.keyword) {
      clauses.push('(nickname LIKE ? OR handle LIKE ?)');
      params.push(`%${filter.keyword}%`, `%${filter.keyword}%`);
    }
    if (filter.region) {
      clauses.push('region = ?');
      params.push(filter.region);
    }
    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb().prepare(`SELECT * FROM influencer ${where} ORDER BY total_gmv_cent DESC`).all(...params) as Influencer[];
  },

  findInfluencer(id: number): Influencer | undefined {
    return getDb().prepare('SELECT * FROM influencer WHERE id = ?').get(id) as Influencer | undefined;
  },

  findInfluencerByHandle(handle: string): Influencer | undefined {
    return getDb().prepare('SELECT * FROM influencer WHERE handle = ?').get(handle) as Influencer | undefined;
  },

  createInfluencer(input: { nickname: string; handle: string; followers: number; category: string; commissionRate: number; region: string }) {
    const info = getDb()
      .prepare(
        `INSERT INTO influencer (nickname, handle, followers, category, commission_rate, region, status)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      )
      .run(input.nickname, input.handle, input.followers, input.category, input.commissionRate, input.region);
    return Number(info.lastInsertRowid);
  },

  links(influencerId?: number): AffiliateLink[] {
    const db = getDb();
    if (influencerId) {
      return db.prepare('SELECT * FROM affiliate_link WHERE influencer_id = ? ORDER BY id').all(influencerId) as AffiliateLink[];
    }
    return db.prepare('SELECT * FROM affiliate_link ORDER BY gmv_cent DESC').all() as AffiliateLink[];
  },

  findLinkByCode(code: string): AffiliateLink | undefined {
    return getDb().prepare('SELECT * FROM affiliate_link WHERE link_code = ?').get(code) as AffiliateLink | undefined;
  },

  createLink(input: { influencerId: number; productId: number; linkCode: string; utmSource: string; utmCampaign?: string }) {
    const info = getDb()
      .prepare(
        `INSERT INTO affiliate_link (influencer_id, product_id, link_code, utm_source, utm_medium, utm_campaign)
         VALUES (?, ?, ?, ?, 'AFFILIATE', ?)`,
      )
      .run(input.influencerId, input.productId, input.linkCode, input.utmSource, input.utmCampaign ?? null);
    return Number(info.lastInsertRowid);
  },

  samples(status?: string) {
    const db = getDb();
    const sql = status
      ? 'SELECT ss.*, i.nickname, p.title AS product_title FROM sample_shipment ss LEFT JOIN influencer i ON i.id = ss.influencer_id LEFT JOIN product p ON p.id = ss.product_id WHERE ss.status = ? ORDER BY ss.id DESC'
      : 'SELECT ss.*, i.nickname, p.title AS product_title FROM sample_shipment ss LEFT JOIN influencer i ON i.id = ss.influencer_id LEFT JOIN product p ON p.id = ss.product_id ORDER BY ss.id DESC';
    return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
  },

  listCommissions(filter: { influencerId?: number; status?: string } = {}): CommissionRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.influencerId) {
      clauses.push('c.influencer_id = ?');
      params.push(filter.influencerId);
    }
    if (filter.status) {
      clauses.push('c.status = ?');
      params.push(filter.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
      .prepare(
        `SELECT c.*, i.nickname, o.platform_order_id
           FROM commission_record c
           LEFT JOIN influencer i ON i.id = c.influencer_id
           LEFT JOIN platform_order o ON o.id = c.order_id
           ${where}
          ORDER BY c.created_at DESC, c.id DESC`,
      )
      .all(...params) as CommissionRecord[];
  },

  /** 佣金幂等计提：同一达人同一订单只记一次 */
  insertCommissionIfAbsent(input: {
    influencerId: number;
    orderId: number;
    linkId: number | null;
    gmvCent: number;
    commissionRate: number;
    commissionAmountCent: number;
    currencyCode: string;
  }): { inserted: boolean; id: number } {
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO commission_record (influencer_id, order_id, link_id, gmv_cent, commission_rate,
           commission_amount_cent, currency_code, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
         ON CONFLICT (influencer_id, order_id) DO NOTHING`,
      )
      .run(
        input.influencerId,
        input.orderId,
        input.linkId,
        input.gmvCent,
        input.commissionRate,
        input.commissionAmountCent,
        input.currencyCode,
      );
    if (info.changes === 0) {
      const row = db
        .prepare('SELECT id FROM commission_record WHERE influencer_id = ? AND order_id = ?')
        .get(input.influencerId, input.orderId) as { id: number };
      return { inserted: false, id: row.id };
    }
    return { inserted: true, id: Number(info.lastInsertRowid) };
  },

  pendingCommissions(influencerId: number, from: string, to: string): CommissionRecord[] {
    return getDb()
      .prepare(
        `SELECT * FROM commission_record
          WHERE influencer_id = ? AND status = 'PENDING'
            AND created_at >= ? AND created_at <= ?
          ORDER BY id`,
      )
      .all(influencerId, `${from} 00:00:00`, `${to} 23:59:59`) as CommissionRecord[];
  },

  markCommissionsStatus(ids: number[], status: string): number {
    if (!ids.length) return 0;
    const placeholders = ids.map(() => '?').join(',');
    return getDb().prepare(`UPDATE commission_record SET status = ? WHERE id IN (${placeholders})`).run(status, ...ids).changes;
  },

  updateCommissionStatus(id: number, status: string): number {
    return getDb().prepare('UPDATE commission_record SET status = ? WHERE id = ?').run(status, id).changes;
  },

  commissionSummary(): Array<{ status: string; c: number; amount: number }> {
    return getDb()
      .prepare('SELECT status, COUNT(1) AS c, COALESCE(SUM(commission_amount_cent), 0) AS amount FROM commission_record GROUP BY status')
      .all() as Array<{ status: string; c: number; amount: number }>;
  },
};
