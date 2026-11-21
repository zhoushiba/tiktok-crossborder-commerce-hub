import { del, download, get, patch, post, type PageData } from './request';

export type { PageData };

/* ------------------------------ 通用类型 ------------------------------ */

export interface LoginResult {
  token: string;
  tokenType: string;
  expiresIn: string;
  user: { id: number; username: string; role: string; realName: string };
}

export interface Shop {
  id: number;
  shop_name: string;
  platform: string;
  region: string;
  currency_code: string;
  timezone: string;
  status: string;
  site_count?: number;
  order_count?: number;
  pending_count?: number;
  token_valid?: boolean;
  sites?: ShopSite[];
}

export interface ShopSite {
  id: number;
  shop_id: number;
  site_code: string;
  site_name: string;
  country: string;
  currency_code: string;
  timezone: string;
}

export interface Product {
  id: number;
  sku: string;
  title: string;
  image_url: string;
  category: string;
  cost_price_cent: number;
  sale_price_cent: number;
  currency_code: string;
  weight_g: number;
  commission_rate: number;
  shipping_mode: string;
  site_code: string | null;
  status: string;
  cost_price_yuan?: number;
  sale_price_yuan?: number;
}

export interface ProfitResult {
  currency_code: string;
  rate: number;
  sale_price_cent: number;
  cost_cny_cent: number;
  freight_cny_cent: number;
  platform_fee_cny_cent: number;
  commission_cny_cent: number;
  gross_profit_cny_cent: number;
  gross_margin: number;
  net_margin: number;
  breakeven_price_cent: number;
  profitable: boolean;
  breakdown: Array<{ key: string; label: string; amount_cny_cent: number }>;
}

export interface LiveSession {
  id: number;
  shop_id: number;
  shop_name?: string;
  title: string;
  host_name: string;
  scheduled_at: string;
  duration_min: number;
  gmv_target_cent: number;
  actual_gmv_cent: number;
  status: string;
  viewers: number;
  peak_online: number;
  orders_count: number;
  review_note?: string | null;
  achievement_rate?: number;
  on_track?: boolean;
}

export interface Order {
  id: number;
  shop_id: number;
  shop_name?: string;
  platform_order_id: string;
  status: string;
  buyer_name: string;
  currency_code: string;
  total_amount_cent: number;
  total_amount_yuan?: number;
  base_amount_yuan?: number;
  site_code: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  refund_status: string | null;
  refund_amount_cent: number;
  created_at: string;
  overdue?: boolean;
  item_count?: number;
}

export interface Influencer {
  id: number;
  nickname: string;
  handle: string;
  followers: number;
  category: string;
  commission_rate: number;
  region: string;
  status: string;
  total_gmv_yuan?: number;
  link_count?: number;
  pending_commission_yuan?: number;
  roi?: number | null;
}

export interface Commission {
  id: number;
  influencer_id: number;
  nickname?: string;
  handle?: string;
  order_id: number;
  platform_order_id?: string;
  gmv_cent: number;
  gmv_yuan?: number;
  commission_rate: number;
  commission_amount_cent: number;
  commission_yuan?: number;
  currency_code: string;
  status: string;
  created_at: string;
}

export interface Settlement {
  id: number;
  settlement_no: string;
  influencer_id: number;
  nickname?: string;
  period_start: string;
  period_end: string;
  total_gmv_cent: number;
  commission_amount_cent: number;
  commission_amount_yuan?: number;
  base_amount_yuan?: number;
  currency_code: string;
  status: string;
  paid_at: string | null;
  items?: SettlementItem[];
}

export interface SettlementItem {
  id: number;
  commission_id: number;
  amount_cent: number;
  platform_order_id?: string;
  amount_yuan?: number;
}

export interface InventoryRow {
  id: number;
  product_id: number;
  sku: string;
  title: string;
  shop_id: number;
  shop_name: string;
  available_qty: number;
  safety_qty: number;
  gap_qty?: number;
  warehouse: string;
  stock_level?: string;
  sale_price_yuan?: number;
  stock_value_yuan?: number;
}

export interface LogisticsRow {
  id: number;
  order_id: number;
  platform_order_id?: string;
  type: string;
  carrier: string;
  tracking_no: string;
  status: string;
  origin: string;
  destination: string;
  exception_flag: number;
  exception_reason: string | null;
  created_at: string;
}

export interface DashboardOverview {
  generated_at: string;
  kpi: {
    gmv_yuan: number;
    order_count: number;
    aov_yuan: number;
    refund_yuan: number;
    live_gmv_yuan: number;
    commission_pending_yuan: number;
    refund_rate: number;
    live_gmv_ratio: number;
  };
  trend: Array<{ date: string; gmv_yuan: number; order_count: number }>;
  siteShare: Array<{ region: string; region_label: string; gmv_cent: number; order_count: number; ratio: number }>;
  topProducts: Array<{ sku: string; title: string; qty: number; gmv_cent: number; gmv_yuan: number }>;
  shops: Array<{ shop_id: number; shop_name: string; region: string; gmv_yuan: number; order_count: number; pending_count: number }>;
  todo: { overdue_shipment: number; exception_logistics: number; low_stock: number; pending_settlement: number };
  liveRoi: Array<{ session_id: number; title: string; actual_gmv_cent: number; gmv_target_cent: number; roi: number | null }>;
  statusDistribution: Array<{ status: string; c: number }>;
}

export interface AuditLog {
  id: number;
  username: string;
  action: string;
  resource: string;
  resource_id: string | null;
  method: string;
  path: string;
  ip: string;
  detail: string | null;
  created_at: string;
}

/* ------------------------------ 认证 ------------------------------ */

export const authApi = {
  login: (payload: { username: string; password: string }) => post<LoginResult>('/auth/login', payload),
  me: () => get<LoginResult['user']>('/auth/me'),
  users: () => get<Array<{ id: number; username: string; real_name: string; role: string; status: string }>>('/auth/users'),
  createUser: (payload: Record<string, unknown>) => post('/auth/users', payload),
};

/* ------------------------------ 店铺与汇率 ------------------------------ */

export const shopApi = {
  list: () => get<Shop[]>('/shops'),
  detail: (id: number) => get<Shop>(`/shops/${id}`),
  sites: (id: number) => get<ShopSite[]>(`/shops/${id}/sites`),
  create: (payload: Record<string, unknown>) => post<Shop>('/shops', payload),
  authorize: (id: number) => post<Shop>(`/shops/${id}/authorize`),
  updateStatus: (id: number, status: string) => patch<Shop>(`/shops/${id}/status`, { status }),
};

export const currencyApi = {
  currencies: () => get<Array<{ code: string; name: string; symbol: string }>>('/currencies'),
  rates: () => get<Array<Record<string, unknown>>>('/currencies/rates'),
  convert: (payload: { amountCent: number; from: string; to: string; date?: string }) =>
    post<{ amountCent: number; rate: number; rateDate: string; base: string; quote: string; inverted: boolean }>(
      '/currencies/convert',
      payload,
    ),
  upsertRate: (payload: Record<string, unknown>) => post('/currencies/rates', payload),
};

/* ------------------------------ 选品 ------------------------------ */

export const productApi = {
  list: (params: Record<string, unknown>) => get<PageData<Product>>('/products', params),
  detail: (id: number) => get<Product & { costs: unknown[]; inventory: InventoryRow[]; profit: ProfitResult }>(`/products/${id}`),
  categories: () => get<Array<{ category: string; count: number }>>('/products/categories'),
  create: (payload: Record<string, unknown>) => post<Product>('/products', payload),
  update: (id: number, payload: Record<string, unknown>) => patch<Product>(`/products/${id}`, payload),
  remove: (id: number) => del<Product>(`/products/${id}`),
  profit: (payload: Record<string, unknown>) => post<ProfitResult>('/products/profit-calc', payload),
  detailProfit: (id: number) => get<ProfitResult>(`/products/${id}/profit`),
  importCsv: (csv: string, fileName?: string) =>
    post<{ total: number; successCount: number; errorCount: number; success: string[]; errors: Array<{ row: number; sku: string; message: string }> }>(
      '/products/import',
      { csv, fileName },
    ),
  exportCsv: () => download('/products/export.csv', 'products.csv'),
};

/* ------------------------------ 直播 ------------------------------ */

export const liveApi = {
  list: (params?: Record<string, unknown>) => get<LiveSession[]>('/live-sessions', params),
  upcoming: () => get<LiveSession[]>('/live-sessions/upcoming'),
  detail: (id: number) => get<LiveSession & { metricSeries: Array<Record<string, number>> }>(`/live-sessions/${id}`),
  create: (payload: Record<string, unknown>) => post<LiveSession>('/live-sessions', payload),
  transition: (id: number, payload: Record<string, unknown>) => post<LiveSession>(`/live-sessions/${id}/status`, payload),
  pushMetric: (id: number, payload: Record<string, unknown>) => post(`/live-sessions/${id}/metrics`, payload),
  review: (id: number, note: string) => post(`/live-sessions/${id}/review`, { note }),
};

/* ------------------------------ 订单 ------------------------------ */

export const orderApi = {
  list: (params: Record<string, unknown>) => get<PageData<Order>>('/orders', params),
  detail: (id: number) => get<Order & { items: unknown[]; statusLogs: unknown[]; logistics: LogisticsRow[] }>(`/orders/${id}`),
  sync: (payload: { shopId?: number; status?: string; pageSize?: number }) =>
    post<Array<{ shopId: number; fetched: number; inserted: number; duplicated: number; failed: number; pages: number; errors: string[] }>>(
      '/orders/sync',
      payload,
    ),
  overdue: () => get<Array<Order & { hours: number }>>('/orders/overdue'),
  ship: (id: number, payload: { carrier: string; trackingNo: string; deductInventory?: boolean }) =>
    post<Order>(`/orders/${id}/ship`, payload),
  delivery: (id: number) => post<Order>(`/orders/${id}/delivery`, {}),
  refund: (id: number, payload: { refundStatus: string; refundAmountYuan?: number; reason?: string }) =>
    post<Order>(`/orders/${id}/refund`, payload),
  updateStatus: (id: number, status: string) => patch<Order>(`/orders/${id}/status`, { status }),
  exportCsv: () => download('/orders/export.csv', 'orders.csv'),
};

/* ------------------------------ 达人分销与结算 ------------------------------ */

export const affiliateApi = {
  list: (params?: Record<string, unknown>) => get<Influencer[]>('/affiliates', params),
  detail: (id: number) => get<Influencer & { links: Array<Record<string, unknown>>; summary: Record<string, number> }>(`/affiliates/${id}`),
  create: (payload: Record<string, unknown>) => post<Influencer>('/affiliates', payload),
  commissions: (params?: Record<string, unknown>) => get<Commission[]>('/affiliates/commissions', params),
  summary: () => get<Record<string, unknown>>('/affiliates/summary'),
  createLink: (payload: Record<string, unknown>) => post('/affiliates/links', payload),
  accrue: (orderId: number) => post<{ created: unknown[]; totalYuan: number }>(`/affiliates/orders/${orderId}/accrue`, {}),
};

export const settlementApi = {
  list: (params?: Record<string, unknown>) => get<Settlement[]>('/settlements', params),
  detail: (id: number) => get<Settlement>(`/settlements/${id}`),
  create: (payload: { influencerId: number; periodStart: string; periodEnd: string; remark?: string }) =>
    post<Settlement>('/settlements', payload),
  updateStatus: (id: number, status: string) => patch<Settlement>(`/settlements/${id}/status`, { status }),
  summary: () => get<Record<string, unknown>>('/settlements/summary'),
};

/* ------------------------------ 库存与物流 ------------------------------ */

export const inventoryApi = {
  list: (params: Record<string, unknown>) => get<InventoryRow[]>('/inventory', params),
  lowStock: () => get<{ count: number; list: InventoryRow[] }>('/inventory/low-stock'),
  adjust: (payload: { productId: number; shopId: number; availableQty: number; safetyQty?: number }) =>
    patch('/inventory/adjust', payload),
  logistics: (params?: Record<string, unknown>) => get<LogisticsRow[]>('/inventory/logistics', params),
  markException: (id: number, reason: string) => post(`/inventory/logistics/${id}/exception`, { reason }),
  advance: (id: number, status: string) => patch(`/inventory/logistics/${id}/status`, { status }),
};

/* ------------------------------ 看板与审计 ------------------------------ */

export const dashboardApi = {
  overview: (days = 14) => get<DashboardOverview>('/dashboard/overview', { days }),
  live: () => get<{
    totalSessions: number;
    liveSessions: number;
    totalGmvYuan: number;
    totalTargetYuan: number;
    sessions: LiveSession[];
    current: (LiveSession & { metrics: Array<Record<string, number>> }) | null;
    roi: Array<{ session_id: number; title: string; roi: number | null }>;
  }>('/dashboard/live'),
  todo: () => get<{ overdue_shipment: number; exception_logistics: number; low_stock: number; pending_settlement: number; inventoryAlerts: InventoryRow[] }>('/dashboard/todo'),
  dailyReports: () => get<unknown[]>('/dashboard/daily-reports'),
  auditLogs: (params?: Record<string, unknown>) => get<AuditLog[]>('/dashboard/audit-logs', params),
  auditStatistics: () => get<{ total: number; byResource: Array<{ resource: string; c: number }>; recent: number }>('/dashboard/audit-statistics'),
};

/* ------------------------------ 实训 ------------------------------ */

export const trainingApi = {
  overview: () => get<{
    statistics: { student_count: number; task_count: number; score_count: number; avg_score: number; best_ratio: number };
    passRate: number;
    students: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
  }>('/training/overview'),
  students: () => get<Array<Record<string, unknown>>>('/training/students'),
  createStudent: (payload: Record<string, unknown>) => post('/training/students', payload),
  tasks: () => get<Array<Record<string, unknown>>>('/training/tasks'),
  createTask: (payload: Record<string, unknown>) => post('/training/tasks', payload),
  scores: () => get<Array<Record<string, unknown>>>('/training/scores'),
  grade: (payload: { studentId: number; taskId: number; score: number; feedback?: string }) =>
    post('/training/scores', payload),
};

/* ------------------------------ 系统 ------------------------------ */

export const systemApi = {
  health: () => get<{ status: string; env: string; database: string; shopCount: number; mockGateway: string; uptimeSeconds: number }>('/system/health'),
  config: () => get<Array<{ id: number; config_key: string; config_value: string; description: string }>>('/system/config'),
};
