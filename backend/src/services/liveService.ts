import { liveRepo } from '../repositories/liveRepo';
import { shopRepo } from '../repositories/shopRepo';
import { ApiError } from '../utils/response';
import { nowUtc, toUtcString } from '../utils/datetime';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ['LIVE', 'CANCELLED'],
  LIVE: ['ENDED'],
  ENDED: ['REVIEWED'],
  REVIEWED: [],
  CANCELLED: [],
};

export const liveService = {
  list(filter: { shopId?: number; status?: string }) {
    return liveRepo.list(filter).map((session) => {
      const shop = shopRepo.findById(session.shop_id);
      const achievement = session.gmv_target_cent > 0 ? session.actual_gmv_cent / session.gmv_target_cent : 0;
      return {
        ...session,
        shop_name: shop?.shop_name,
        region: shop?.region,
        gmv_target_yuan: Number((session.gmv_target_cent / 100).toFixed(2)),
        actual_gmv_yuan: Number((session.actual_gmv_cent / 100).toFixed(2)),
        achievement_rate: Number((achievement * 100).toFixed(2)),
        on_track: achievement >= 0.8,
      };
    });
  },

  detail(id: number) {
    const session = liveRepo.findById(id);
    if (!session) {
      throw ApiError.notFound(`直播场次 ${id} 不存在`);
    }
    const metrics = liveRepo.metrics(id);
    return {
      ...session,
      shop: shopRepo.findById(session.shop_id),
      achievement_rate:
        session.gmv_target_cent > 0 ? Number(((session.actual_gmv_cent / session.gmv_target_cent) * 100).toFixed(2)) : 0,
      metrics,
      /** 直播中控台曲线：累计 GMV 与在线人数 */
      metricSeries: metrics.map((m) => ({ time: m.metric_at, gmv: m.gmv_cent / 100, online: m.online_count, orders: m.orders })),
    };
  },

  create(input: { shopId: number; title: string; hostName: string; scheduledAt: string; durationMin?: number; gmvTargetYuan?: number }) {
    if (!shopRepo.findById(input.shopId)) {
      throw ApiError.badRequest(`店铺 ${input.shopId} 不存在`);
    }
    if (new Date(input.scheduledAt.replace(' ', 'T')).toString() === 'Invalid Date') {
      throw ApiError.badRequest('scheduledAt 格式应为 YYYY-MM-DD HH:mm:ss');
    }
    const id = liveRepo.create({
      shopId: input.shopId,
      title: input.title,
      hostName: input.hostName,
      scheduledAt: input.scheduledAt,
      durationMin: input.durationMin ?? 120,
      gmvTargetCent: Math.round((input.gmvTargetYuan ?? 0) * 100),
    });
    return this.detail(id);
  },

  /** 状态流转：PLANNED → LIVE → ENDED → REVIEWED，非法流转返回 409 */
  transition(id: number, status: string, payload: { actualGmvYuan?: number; viewers?: number; peakOnline?: number; ordersCount?: number; reviewNote?: string } = {}) {
    const session = liveRepo.findById(id);
    if (!session) {
      throw ApiError.notFound(`直播场次 ${id} 不存在`);
    }
    const allowed = ALLOWED_TRANSITIONS[session.status] ?? [];
    if (!allowed.includes(status)) {
      throw ApiError.conflict(`场次当前状态 ${session.status} 不能流转到 ${status}，允许：${allowed.join(' / ') || '无'}`);
    }
    const extra: Record<string, unknown> = {};
    if (payload.actualGmvYuan !== undefined) extra.actualGmvCent = Math.round(payload.actualGmvYuan * 100);
    if (payload.viewers !== undefined) extra.viewers = payload.viewers;
    if (payload.peakOnline !== undefined) extra.peakOnline = payload.peakOnline;
    if (payload.ordersCount !== undefined) extra.ordersCount = payload.ordersCount;
    if (payload.reviewNote !== undefined) extra.reviewNote = payload.reviewNote;
    liveRepo.updateStatus(id, status, extra as never);
    return this.detail(id);
  },

  /** 中控台打点：写入一条实时指标，并同步累加场次汇总 */
  pushMetric(id: number, input: { onlineCount: number; gmvYuan: number; orders: number }) {
    const session = liveRepo.findById(id);
    if (!session) {
      throw ApiError.notFound(`直播场次 ${id} 不存在`);
    }
    if (session.status !== 'LIVE') {
      throw ApiError.conflict('只有在直播中的场次可以打点');
    }
    const metricAt = nowUtc();
    const conversionRate = input.onlineCount > 0 ? Number((input.orders / input.onlineCount).toFixed(4)) : 0;
    liveRepo.appendMetric({
      sessionId: id,
      metricAt,
      onlineCount: input.onlineCount,
      gmvCent: Math.round(input.gmvYuan * 100),
      orders: input.orders,
      conversionRate,
    });
    liveRepo.updateStatus(id, 'LIVE', {
      actualGmvCent: session.actual_gmv_cent + Math.round(input.gmvYuan * 100),
      viewers: Math.max(session.viewers, input.onlineCount),
      peakOnline: Math.max(session.peak_online, input.onlineCount),
      ordersCount: session.orders_count + input.orders,
    });
    return { sessionId: id, metricAt, ...input };
  },

  /** 复盘：把场次销售数据按 30 天趋势中的当日写入 daily_report，形成日报 */
  review(id: number, note?: string) {
    const session = liveRepo.findById(id);
    if (!session) {
      throw ApiError.notFound(`直播场次 ${id} 不存在`);
    }
    if (!note) {
      throw ApiError.badRequest('复盘必须填写备注');
    }
    liveRepo.updateStatus(id, 'REVIEWED', { reviewNote: note });
    return this.detail(id);
  },

  upcoming(limit = 5) {
    return liveRepo
      .list({ status: 'PLANNED' })
      .slice(0, limit)
      .map((session) => ({ ...session, scheduled_at: toUtcString(new Date(session.scheduled_at.replace(' ', 'T') + 'Z')) }));
  },
};
