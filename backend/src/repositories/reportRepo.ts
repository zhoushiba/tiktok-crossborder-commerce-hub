import { getDb } from '../db';

/**
 * 看板聚合查询仓库。
 * 所有金额统一折成基准币（CNY）分，便于跨站点对比；`base_amount_cent` 在建单时按当时汇率快照写入。
 */
export const reportRepo = {
  kpi(): {
    gmv_cent: number;
    order_count: number;
    aov_cent: number;
    refund_cent: number;
    live_gmv_cent: number;
    commission_pending_cent: number;
  } {
    return getDb()
      .prepare(
        `SELECT
           COALESCE((SELECT SUM(base_amount_cent) FROM platform_order WHERE status NOT IN ('CANCELLED','REFUNDED')), 0) AS gmv_cent,
           COALESCE((SELECT COUNT(1) FROM platform_order WHERE status NOT IN ('CANCELLED')), 0) AS order_count,
           COALESCE((SELECT CAST(AVG(base_amount_cent) AS INTEGER) FROM platform_order WHERE status NOT IN ('CANCELLED','REFUNDED')), 0) AS aov_cent,
           COALESCE((SELECT SUM(refund_amount_cent) FROM platform_order WHERE refund_status IS NOT NULL), 0) AS refund_cent,
           COALESCE((SELECT SUM(actual_gmv_cent) FROM live_session), 0) AS live_gmv_cent,
           COALESCE((SELECT SUM(commission_amount_cent) FROM commission_record WHERE status = 'PENDING'), 0) AS commission_pending_cent`,
      )
      .get() as {
      gmv_cent: number;
      order_count: number;
      aov_cent: number;
      refund_cent: number;
      live_gmv_cent: number;
      commission_pending_cent: number;
    };
  },

  /** 最近 N 天 GMV / 订单量趋势（按 UTC 日期分组，缺失日期补 0 由服务层完成） */
  gmvTrend(days: number): Array<{ stat_date: string; gmv_cent: number; order_count: number }> {
    return getDb()
      .prepare(
        `SELECT date(created_at) AS stat_date,
                COALESCE(SUM(base_amount_cent), 0) AS gmv_cent,
                COUNT(1) AS order_count
           FROM platform_order
          WHERE status NOT IN ('CANCELLED')
            AND created_at >= datetime('now', ?)
          GROUP BY date(created_at)
          ORDER BY stat_date ASC`,
      )
      .all(`-${days} day`) as Array<{ stat_date: string; gmv_cent: number; order_count: number }>;
  },

  /** 站点（区域）GMV 占比，使用 SUM() OVER () 窗口函数求占比 */
  siteShare(): Array<{ region: string; gmv_cent: number; order_count: number; ratio: number }> {
    return getDb()
      .prepare(
        `SELECT region, gmv_cent, order_count,
                ROUND(gmv_cent * 100.0 / SUM(gmv_cent) OVER (), 2) AS ratio
           FROM (
             SELECT s.region AS region,
                    COALESCE(SUM(o.base_amount_cent), 0) AS gmv_cent,
                    COUNT(o.id) AS order_count
               FROM platform_order o
               JOIN shop s ON s.id = o.shop_id
              WHERE o.status NOT IN ('CANCELLED')
              GROUP BY s.region
           )
          ORDER BY gmv_cent DESC`,
      )
      .all() as Array<{ region: string; gmv_cent: number; order_count: number; ratio: number }>;
  },

  /** Top N 商品（按订单明细金额汇总） */
  topProducts(limit = 5): Array<{ sku: string; title: string; qty: number; gmv_cent: number }> {
    return getDb()
      .prepare(
        `SELECT i.sku, COALESCE(i.title, p.title) AS title,
                SUM(i.quantity) AS qty,
                SUM(i.subtotal_cent) AS gmv_cent
           FROM platform_order_item i
           LEFT JOIN product p ON p.id = i.product_id
           JOIN platform_order o ON o.id = i.order_id
          WHERE o.status NOT IN ('CANCELLED')
          GROUP BY i.sku
          ORDER BY gmv_cent DESC
          LIMIT ?`,
      )
      .all(limit) as Array<{ sku: string; title: string; qty: number; gmv_cent: number }>;
  },

  /** 店铺维度业绩（含未完成订单数，用于运营跟进） */
  shopPerformance(): Array<{
    shop_id: number;
    shop_name: string;
    region: string;
    gmv_cent: number;
    order_count: number;
    pending_count: number;
  }> {
    return getDb()
      .prepare(
        `SELECT s.id AS shop_id, s.shop_name, s.region,
                COALESCE(SUM(CASE WHEN o.status NOT IN ('CANCELLED') THEN o.base_amount_cent END), 0) AS gmv_cent,
                COUNT(CASE WHEN o.status NOT IN ('CANCELLED') THEN 1 END) AS order_count,
                COUNT(CASE WHEN o.status = 'PAID' THEN 1 END) AS pending_count
           FROM shop s
           LEFT JOIN platform_order o ON o.shop_id = s.id
          GROUP BY s.id
          ORDER BY gmv_cent DESC`,
      )
      .all() as Array<{
      shop_id: number;
      shop_name: string;
      region: string;
      gmv_cent: number;
      order_count: number;
      pending_count: number;
    }>;
  },

  /** 直播 ROI：实际 GMV / 目标 GMV，用于场次复盘 */
  liveRoi(): Array<{
    id: number;
    title: string;
    host_name: string;
    status: string;
    gmv_target_cent: number;
    actual_gmv_cent: number;
    roi: number | null;
  }> {
    return getDb()
      .prepare(
        `SELECT id, title, host_name, status, gmv_target_cent, actual_gmv_cent,
                CASE WHEN gmv_target_cent > 0 THEN ROUND(actual_gmv_cent * 1.0 / gmv_target_cent, 4) ELSE NULL END AS roi
           FROM live_session
          ORDER BY scheduled_at DESC`,
      )
      .all() as Array<{
      id: number;
      title: string;
      host_name: string;
      status: string;
      gmv_target_cent: number;
      actual_gmv_cent: number;
      roi: number | null;
    }>;
  },

  /** 订单状态分布（漏斗用） */
  orderStatusDistribution(): Array<{ status: string; c: number }> {
    return getDb().prepare('SELECT status, COUNT(1) AS c FROM platform_order GROUP BY status').all() as Array<{
      status: string;
      c: number;
    }>;
  },

  dailyReports(limit = 14): Array<Record<string, unknown>> {
    return getDb().prepare('SELECT * FROM daily_report ORDER BY report_date DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
  },

  todoSummary(): { overdue_shipment: number; exception_logistics: number; low_stock: number; pending_settlement: number } {
    return getDb()
      .prepare(
        `SELECT
           (SELECT COUNT(1) FROM platform_order WHERE status = 'PAID' AND paid_at < datetime('now','-48 hour')) AS overdue_shipment,
           (SELECT COUNT(1) FROM logistics_order WHERE exception_flag = 1 AND status <> 'DELIVERED') AS exception_logistics,
           (SELECT COUNT(1) FROM inventory WHERE available_qty < safety_qty) AS low_stock,
           (SELECT COUNT(1) FROM settlement WHERE status IN ('PENDING','APPROVED')) AS pending_settlement`,
      )
      .get() as { overdue_shipment: number; exception_logistics: number; low_stock: number; pending_settlement: number };
  },
};
