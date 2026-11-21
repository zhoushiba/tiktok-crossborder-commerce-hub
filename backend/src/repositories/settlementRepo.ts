import { getDb } from '../db';
import type { Settlement } from '../types';

export const settlementRepo = {
  list(filter: { influencerId?: number; status?: string } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.influencerId) {
      clauses.push('s.influencer_id = ?');
      params.push(filter.influencerId);
    }
    if (filter.status) {
      clauses.push('s.status = ?');
      params.push(filter.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
      .prepare(
        `SELECT s.*, i.nickname, i.handle
           FROM settlement s LEFT JOIN influencer i ON i.id = s.influencer_id
           ${where} ORDER BY s.created_at DESC, s.id DESC`,
      )
      .all(...params);
  },

  findById(id: number): Settlement | undefined {
    return getDb()
      .prepare(
        `SELECT s.*, i.nickname, i.handle FROM settlement s
           LEFT JOIN influencer i ON i.id = s.influencer_id WHERE s.id = ?`,
      )
      .get(id) as Settlement | undefined;
  },

  items(settlementId: number) {
    return getDb()
      .prepare(
        `SELECT si.*, c.order_id, c.gmv_cent, c.commission_rate, o.platform_order_id
           FROM settlement_item si
           JOIN commission_record c ON c.id = si.commission_id
           LEFT JOIN platform_order o ON o.id = c.order_id
          WHERE si.settlement_id = ? ORDER BY si.id`,
      )
      .all(settlementId);
  },

  create(input: {
    settlementNo: string;
    influencerId: number;
    periodStart: string;
    periodEnd: string;
    totalGmvCent: number;
    commissionAmountCent: number;
    currencyCode: string;
    exchangeRateId: number | null;
    baseAmountCent: number;
    remark?: string;
  }) {
    const info = getDb()
      .prepare(
        `INSERT INTO settlement (settlement_no, influencer_id, period_start, period_end, total_gmv_cent,
           commission_amount_cent, currency_code, exchange_rate_id, base_amount_cent, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      )
      .run(
        input.settlementNo,
        input.influencerId,
        input.periodStart,
        input.periodEnd,
        input.totalGmvCent,
        input.commissionAmountCent,
        input.currencyCode,
        input.exchangeRateId,
        input.baseAmountCent,
        input.remark ?? null,
      );
    return Number(info.lastInsertRowid);
  },

  addItem(settlementId: number, commissionId: number, amountCent: number) {
    getDb()
      .prepare('INSERT INTO settlement_item (settlement_id, commission_id, amount_cent) VALUES (?, ?, ?)')
      .run(settlementId, commissionId, amountCent);
  },

  updateStatus(id: number, status: string) {
    const db = getDb();
    if (status === 'PAID') {
      return db.prepare("UPDATE settlement SET status = ?, paid_at = datetime('now') WHERE id = ?").run(status, id).changes;
    }
    return db.prepare('UPDATE settlement SET status = ? WHERE id = ?').run(status, id).changes;
  },
};
