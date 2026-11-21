import { reportRepo } from '../repositories/reportRepo';
import { liveRepo } from '../repositories/liveRepo';
import { inventoryRepo } from '../repositories/inventoryRepo';
import { centsToYuan } from '../utils/money';
import { nowUtc } from '../utils/datetime';

const REGION_LABEL: Record<string, string> = { US: '美区', UK: '英区', SEA: '东南亚' };

export const dashboardService = {
  /** 总览看板：一次返回 KPI、趋势、站点占比、Top 商品、待办与直播 ROI，前端只需一次请求 */
  overview(days = 14) {
    const kpi = reportRepo.kpi();
    const trend = this.fillTrend(reportRepo.gmvTrend(days), days);
    const siteShare = reportRepo.siteShare().map((row) => ({ ...row, region_label: REGION_LABEL[row.region] ?? row.region }));
    const topProducts = reportRepo.topProducts(5).map((row) => ({ ...row, gmv_yuan: centsToYuan(row.gmv_cent) }));
    const shops = reportRepo.shopPerformance().map((row) => ({ ...row, gmv_yuan: centsToYuan(row.gmv_cent) }));
    const todo = reportRepo.todoSummary();
    const liveRoi = reportRepo.liveRoi().slice(0, 5);
    const statusDistribution = reportRepo.orderStatusDistribution();
    return {
      generated_at: nowUtc(),
      kpi: {
        gmv_yuan: centsToYuan(kpi.gmv_cent),
        order_count: kpi.order_count,
        aov_yuan: centsToYuan(kpi.aov_cent),
        refund_yuan: centsToYuan(kpi.refund_cent),
        live_gmv_yuan: centsToYuan(kpi.live_gmv_cent),
        commission_pending_yuan: centsToYuan(kpi.commission_pending_cent),
        /** 退款率与直播 GMV 占比，直接对应运营关注的健康度指标 */
        refund_rate: kpi.gmv_cent > 0 ? Number(((kpi.refund_cent / (kpi.gmv_cent + kpi.refund_cent)) * 100).toFixed(2)) : 0,
        live_gmv_ratio: kpi.gmv_cent > 0 ? Number(((kpi.live_gmv_cent / (kpi.gmv_cent + kpi.live_gmv_cent)) * 100).toFixed(2)) : 0,
      },
      trend,
      siteShare,
      topProducts,
      shops,
      todo,
      liveRoi,
      statusDistribution,
    };
  },

  /** 补齐缺失日期，保证 ECharts 折线图 X 轴连续 */
  fillTrend(rows: Array<{ stat_date: string; gmv_cent: number; order_count: number }>, days: number) {
    const map = new Map(rows.map((row) => [row.stat_date, row]));
    const result: Array<{ date: string; gmv_yuan: number; order_count: number }> = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(today.getTime() - i * 86400000);
      const key = date.toISOString().slice(0, 10);
      const row = map.get(key);
      result.push({ date: key, gmv_yuan: centsToYuan(row?.gmv_cent ?? 0), order_count: row?.order_count ?? 0 });
    }
    return result;
  },

  /** 直播大屏：场次汇总 + 最近直播指标序列 */
  liveDashboard() {
    const sessions = liveRepo.list({});
    const live = sessions.find((session) => session.status === 'LIVE');
    return {
      totalSessions: sessions.length,
      liveSessions: sessions.filter((s) => s.status === 'LIVE').length,
      totalGmvYuan: centsToYuan(sessions.reduce((acc, s) => acc + s.actual_gmv_cent, 0)),
      totalTargetYuan: centsToYuan(sessions.reduce((acc, s) => acc + s.gmv_target_cent, 0)),
      /** 场次列表：中控台左侧排期表直接用这个数组渲染 */
      sessions: sessions.map((session) => ({
        ...session,
        actual_gmv_yuan: centsToYuan(session.actual_gmv_cent),
        gmv_target_yuan: centsToYuan(session.gmv_target_cent),
        achievement_rate:
          session.gmv_target_cent > 0 ? Number(((session.actual_gmv_cent / session.gmv_target_cent) * 100).toFixed(2)) : 0,
        on_track: session.gmv_target_cent > 0 && session.actual_gmv_cent / session.gmv_target_cent >= 0.8,
      })),
      current: live
        ? {
            ...live,
            actual_gmv_yuan: centsToYuan(live.actual_gmv_cent),
            gmv_target_yuan: centsToYuan(live.gmv_target_cent),
            achievement_rate:
              live.gmv_target_cent > 0 ? Number(((live.actual_gmv_cent / live.gmv_target_cent) * 100).toFixed(2)) : 0,
            metrics: liveRepo.metrics(live.id),
          }
        : null,
      roi: reportRepo.liveRoi(),
    };
  },

  /** 运营待办：超时未发货、物流异常、低库存、待结算 */
  todo() {
    const todo = reportRepo.todoSummary();
    return {
      ...todo,
      inventoryAlerts: inventoryRepo.list({ lowStockOnly: true }).slice(0, 10),
    };
  },

  dailyReports(limit?: number) {
    return reportRepo.dailyReports(limit);
  },
};
