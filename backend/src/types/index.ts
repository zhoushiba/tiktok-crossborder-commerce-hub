/** 领域模型类型（与 SQLite 表结构一一对应，字段名保持 snake_case 以便直接映射查询结果） */

export type UserRole = 'ADMIN' | 'OPERATOR' | 'HOST' | 'AGENCY';

export interface SysUser {
  id: number;
  username: string;
  password_hash: string;
  real_name: string;
  role: UserRole;
  email: string | null;
  status: string;
  created_at: string;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimal_digits: number;
}

export interface ExchangeRate {
  id: number;
  base_currency: string;
  quote_currency: string;
  rate: number;
  effective_date: string;
  source: string;
  created_at: string;
}

export interface Shop {
  id: number;
  shop_name: string;
  platform: string;
  region: 'US' | 'UK' | 'SEA';
  currency_code: string;
  timezone: string;
  app_key: string | null;
  app_secret: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  status: string;
  authorized_at: string | null;
  created_at: string;
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
  image_url: string | null;
  category: string;
  cost_price_cent: number;
  sale_price_cent: number;
  currency_code: string;
  weight_g: number;
  volume_cm3: number | null;
  commission_rate: number;
  shipping_mode: string;
  site_code: string | null;
  status: string;
  created_at: string;
}

export interface ProductCost {
  id: number;
  product_id: number;
  cost_type: string;
  amount_cent: number;
  currency_code: string;
  note: string | null;
}

export interface Inventory {
  id: number;
  product_id: number;
  shop_id: number;
  available_qty: number;
  safety_qty: number;
  warehouse: string | null;
  updated_at: string;
}

export interface LiveSession {
  id: number;
  shop_id: number;
  title: string;
  host_name: string;
  scheduled_at: string;
  duration_min: number;
  gmv_target_cent: number;
  actual_gmv_cent: number;
  status: 'PLANNED' | 'LIVE' | 'ENDED' | 'REVIEWED';
  viewers: number;
  peak_online: number;
  orders_count: number;
  review_note: string | null;
  created_at: string;
}

export interface LiveMetric {
  id: number;
  session_id: number;
  metric_at: string;
  online_count: number;
  gmv_cent: number;
  orders: number;
  conversion_rate: number;
}

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'CANCELLED';

export interface PlatformOrder {
  id: number;
  shop_id: number;
  platform_order_id: string;
  status: OrderStatus;
  buyer_name: string | null;
  currency_code: string;
  total_amount_cent: number;
  exchange_rate_id: number | null;
  base_amount_cent: number;
  site_code: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  refund_status: string | null;
  refund_amount_cent: number;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  sku: string;
  title: string | null;
  quantity: number;
  unit_price_cent: number;
  subtotal_cent: number;
}

export interface Influencer {
  id: number;
  nickname: string;
  handle: string;
  followers: number;
  category: string;
  commission_rate: number;
  total_gmv_cent: number;
  region: string;
  status: string;
  created_at: string;
}

export interface AffiliateLink {
  id: number;
  influencer_id: number;
  product_id: number;
  link_code: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string | null;
  clicks: number;
  conversions: number;
  gmv_cent: number;
  created_at: string;
}

export interface CommissionRecord {
  id: number;
  influencer_id: number;
  order_id: number;
  link_id: number | null;
  gmv_cent: number;
  commission_rate: number;
  commission_amount_cent: number;
  currency_code: string;
  status: 'PENDING' | 'CONFIRMED' | 'SETTLED';
  created_at: string;
}

export interface Settlement {
  id: number;
  settlement_no: string;
  influencer_id: number;
  period_start: string;
  period_end: string;
  total_gmv_cent: number;
  commission_amount_cent: number;
  currency_code: string;
  exchange_rate_id: number | null;
  base_amount_cent: number;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'PAID';
  remark: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface LogisticsOrder {
  id: number;
  order_id: number;
  type: 'FIRST_LEG' | 'LAST_LEG';
  carrier: string;
  tracking_no: string;
  status: string;
  origin: string | null;
  destination: string | null;
  exception_flag: number;
  exception_reason: string | null;
  created_at: string;
}
