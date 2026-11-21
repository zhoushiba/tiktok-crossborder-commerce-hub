import { getDb } from '../db';
import type { LiveMetric, LiveSession } from '../types';

export const liveRepo = {
  list(filter: { shopId?: number; status?: string }): LiveSession[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.shopId) {
      clauses.push('shop_id = ?');
      params.push(filter.shopId);
    }
    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
      .prepare(`SELECT * FROM live_session ${where} ORDER BY scheduled_at DESC`)
      .all(...params) as LiveSession[];
  },

  findById(id: number): LiveSession | undefined {
    return getDb().prepare('SELECT * FROM live_session WHERE id = ?').get(id) as LiveSession | undefined;
  },

  create(input: {
    shopId: number;
    title: string;
    hostName: string;
    scheduledAt: string;
    durationMin: number;
    gmvTargetCent: number;
  }) {
    const info = getDb()
      .prepare(
        `INSERT INTO live_session (shop_id, title, host_name, scheduled_at, duration_min, gmv_target_cent, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PLANNED')`,
      )
      .run(input.shopId, input.title, input.hostName, input.scheduledAt, input.durationMin, input.gmvTargetCent);
    return Number(info.lastInsertRowid);
  },

  updateStatus(id: number, status: string, extra: Partial<{ actualGmvCent: number; viewers: number; peakOnline: number; ordersCount: number; reviewNote: string }> = {}) {
    const sets = ['status = ?'];
    const params: unknown[] = [status];
    if (extra.actualGmvCent !== undefined) {
      sets.push('actual_gmv_cent = ?');
      params.push(extra.actualGmvCent);
    }
    if (extra.viewers !== undefined) {
      sets.push('viewers = ?');
      params.push(extra.viewers);
    }
    if (extra.peakOnline !== undefined) {
      sets.push('peak_online = ?');
      params.push(extra.peakOnline);
    }
    if (extra.ordersCount !== undefined) {
      sets.push('orders_count = ?');
      params.push(extra.ordersCount);
    }
    if (extra.reviewNote !== undefined) {
      sets.push('review_note = ?');
      params.push(extra.reviewNote);
    }
    params.push(id);
    return getDb().prepare(`UPDATE live_session SET ${sets.join(', ')} WHERE id = ?`).run(...params).changes;
  },

  metrics(sessionId: number, limit = 120): LiveMetric[] {
    return getDb()
      .prepare('SELECT * FROM live_metric WHERE session_id = ? ORDER BY metric_at ASC LIMIT ?')
      .all(sessionId, limit) as LiveMetric[];
  },

  appendMetric(input: { sessionId: number; metricAt: string; onlineCount: number; gmvCent: number; orders: number; conversionRate: number }) {
    const info = getDb()
      .prepare(
        `INSERT INTO live_metric (session_id, metric_at, online_count, gmv_cent, orders, conversion_rate)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.sessionId, input.metricAt, input.onlineCount, input.gmvCent, input.orders, input.conversionRate);
    return Number(info.lastInsertRowid);
  },
};
