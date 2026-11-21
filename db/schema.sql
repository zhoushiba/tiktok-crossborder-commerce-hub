-- =====================================================================
-- TikTok 跨境直播电商运营中台 · SQLite 建表脚本（本地开发 / 自动化测试）
-- ---------------------------------------------------------------------
-- 设计要点：
--   1. 金额一律用「分」(INTEGER) 存储，配合 currency_code，避免浮点误差；
--   2. 所有时间一律存 UTC（'YYYY-MM-DD HH:MM:SS'），展示层按站点时区转换；
--   3. 结算单保存 exchange_rate_id，保证本位币换算可追溯（汇率快照）；
--   4. platform_order 唯一键 (shop_id, platform_order_id) 是同步幂等的基石；
--   5. commission_record 唯一键 (influencer_id, order_id) 防止重复计提佣金。
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- 账号与系统
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  real_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'HOST', 'AGENCY')),
  email         TEXT,
  status        TEXT    NOT NULL DEFAULT 'ACTIVE',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  username    TEXT,
  action      TEXT    NOT NULL,
  resource    TEXT    NOT NULL,
  resource_id TEXT,
  method      TEXT,
  path        TEXT,
  ip          TEXT,
  detail      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sys_config (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key   TEXT    NOT NULL UNIQUE,
  config_value TEXT    NOT NULL,
  description  TEXT,
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- 跨境基础能力：币种 / 汇率 / 店铺 / 站点
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currency (
  code           TEXT PRIMARY KEY,
  name           TEXT    NOT NULL,
  symbol         TEXT    NOT NULL,
  decimal_digits INTEGER NOT NULL DEFAULT 2
);

CREATE TABLE IF NOT EXISTS exchange_rate (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  base_currency  TEXT    NOT NULL,
  quote_currency TEXT    NOT NULL,
  rate           REAL    NOT NULL,
  effective_date TEXT    NOT NULL,
  source         TEXT    NOT NULL DEFAULT 'MANUAL',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (base_currency, quote_currency, effective_date)
);

CREATE TABLE IF NOT EXISTS shop (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_name        TEXT    NOT NULL,
  platform         TEXT    NOT NULL DEFAULT 'TIKTOK_SHOP',
  region           TEXT    NOT NULL CHECK (region IN ('US', 'UK', 'SEA')),
  currency_code    TEXT    NOT NULL REFERENCES currency (code),
  timezone         TEXT    NOT NULL,
  app_key          TEXT,
  app_secret       TEXT,
  access_token     TEXT,
  token_expires_at TEXT,
  status           TEXT    NOT NULL DEFAULT 'ACTIVE',
  authorized_at    TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_site (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id       INTEGER NOT NULL REFERENCES shop (id) ON DELETE CASCADE,
  site_code     TEXT    NOT NULL,
  site_name     TEXT    NOT NULL,
  country       TEXT    NOT NULL,
  currency_code TEXT    NOT NULL,
  timezone      TEXT    NOT NULL,
  UNIQUE (shop_id, site_code)
);

-- ---------------------------------------------------------------------
-- 选品库：商品 / 成本明细 / 库存
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sku             TEXT    NOT NULL UNIQUE,
  title           TEXT    NOT NULL,
  image_url       TEXT,
  category        TEXT    NOT NULL,
  cost_price_cent INTEGER NOT NULL,
  sale_price_cent INTEGER NOT NULL,
  currency_code   TEXT    NOT NULL DEFAULT 'USD',
  weight_g        INTEGER NOT NULL DEFAULT 200,
  volume_cm3      INTEGER,
  commission_rate REAL    NOT NULL DEFAULT 0.05,
  shipping_mode   TEXT    NOT NULL DEFAULT 'FBA',
  site_code       TEXT,
  status          TEXT    NOT NULL DEFAULT 'ON_SALE',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_cost (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  cost_type     TEXT    NOT NULL,
  amount_cent   INTEGER NOT NULL,
  currency_code TEXT    NOT NULL DEFAULT 'USD',
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES product (id),
  shop_id       INTEGER NOT NULL REFERENCES shop (id),
  available_qty INTEGER NOT NULL DEFAULT 0,
  safety_qty    INTEGER NOT NULL DEFAULT 20,
  warehouse     TEXT,
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, shop_id)
);

-- ---------------------------------------------------------------------
-- 直播域：场次 / 实时指标
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_session (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id          INTEGER NOT NULL REFERENCES shop (id),
  title            TEXT    NOT NULL,
  host_name        TEXT    NOT NULL,
  scheduled_at     TEXT    NOT NULL,
  duration_min     INTEGER NOT NULL DEFAULT 120,
  gmv_target_cent  INTEGER NOT NULL DEFAULT 0,
  actual_gmv_cent  INTEGER NOT NULL DEFAULT 0,
  status           TEXT    NOT NULL DEFAULT 'PLANNED',
  viewers          INTEGER NOT NULL DEFAULT 0,
  peak_online      INTEGER NOT NULL DEFAULT 0,
  orders_count     INTEGER NOT NULL DEFAULT 0,
  review_note      TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS live_metric (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES live_session (id) ON DELETE CASCADE,
  metric_at       TEXT    NOT NULL,
  online_count    INTEGER NOT NULL DEFAULT 0,
  gmv_cent        INTEGER NOT NULL DEFAULT 0,
  orders          INTEGER NOT NULL DEFAULT 0,
  conversion_rate REAL    NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 订单域：平台订单 / 明细 / 状态流水 / 物流
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_order (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id            INTEGER NOT NULL REFERENCES shop (id),
  platform_order_id  TEXT    NOT NULL,
  status             TEXT    NOT NULL DEFAULT 'PENDING',
  buyer_name         TEXT,
  currency_code      TEXT    NOT NULL,
  total_amount_cent  INTEGER NOT NULL,
  exchange_rate_id   INTEGER REFERENCES exchange_rate (id),
  base_amount_cent   INTEGER NOT NULL,
  site_code          TEXT,
  paid_at            TEXT,
  shipped_at         TEXT,
  delivered_at       TEXT,
  refund_status      TEXT,
  refund_amount_cent INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (shop_id, platform_order_id)
);

CREATE TABLE IF NOT EXISTS platform_order_item (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES platform_order (id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES product (id),
  sku             TEXT    NOT NULL,
  title           TEXT,
  quantity        INTEGER NOT NULL,
  unit_price_cent INTEGER NOT NULL,
  subtotal_cent   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES platform_order (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT    NOT NULL,
  source      TEXT    NOT NULL DEFAULT 'SYNC',
  remark      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logistics_order (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES platform_order (id) ON DELETE CASCADE,
  type             TEXT    NOT NULL,
  carrier          TEXT    NOT NULL,
  tracking_no      TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'CREATED',
  origin           TEXT,
  destination      TEXT,
  exception_flag   INTEGER NOT NULL DEFAULT 0,
  exception_reason TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- 达人分销域：达人 / 寄样 / 专属链接 / 佣金 / 结算
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS influencer (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname        TEXT    NOT NULL,
  handle          TEXT    NOT NULL UNIQUE,
  followers       INTEGER NOT NULL DEFAULT 0,
  category        TEXT    NOT NULL,
  commission_rate REAL    NOT NULL DEFAULT 0.1,
  total_gmv_cent  INTEGER NOT NULL DEFAULT 0,
  region          TEXT    NOT NULL DEFAULT 'US',
  status          TEXT    NOT NULL DEFAULT 'ACTIVE',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sample_shipment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  influencer_id INTEGER NOT NULL REFERENCES influencer (id),
  product_id    INTEGER NOT NULL REFERENCES product (id),
  tracking_no   TEXT,
  status        TEXT    NOT NULL DEFAULT 'PENDING',
  shipped_at    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affiliate_link (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  influencer_id INTEGER NOT NULL REFERENCES influencer (id),
  product_id    INTEGER NOT NULL REFERENCES product (id),
  link_code     TEXT    NOT NULL UNIQUE,
  utm_source    TEXT    NOT NULL DEFAULT 'tiktok',
  utm_medium    TEXT    NOT NULL DEFAULT 'affiliate',
  utm_campaign  TEXT,
  clicks        INTEGER NOT NULL DEFAULT 0,
  conversions   INTEGER NOT NULL DEFAULT 0,
  gmv_cent      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_record (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  influencer_id         INTEGER NOT NULL REFERENCES influencer (id),
  order_id              INTEGER NOT NULL REFERENCES platform_order (id),
  link_id               INTEGER REFERENCES affiliate_link (id),
  gmv_cent              INTEGER NOT NULL,
  commission_rate       REAL    NOT NULL,
  commission_amount_cent INTEGER NOT NULL,
  currency_code         TEXT    NOT NULL DEFAULT 'USD',
  status                TEXT    NOT NULL DEFAULT 'PENDING',
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (influencer_id, order_id)
);

CREATE TABLE IF NOT EXISTS settlement (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_no         TEXT    NOT NULL UNIQUE,
  influencer_id         INTEGER NOT NULL REFERENCES influencer (id),
  period_start          TEXT    NOT NULL,
  period_end            TEXT    NOT NULL,
  total_gmv_cent        INTEGER NOT NULL,
  commission_amount_cent INTEGER NOT NULL,
  currency_code         TEXT    NOT NULL DEFAULT 'USD',
  exchange_rate_id      INTEGER REFERENCES exchange_rate (id),
  base_amount_cent      INTEGER NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'DRAFT',
  remark                TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  paid_at               TEXT
);

CREATE TABLE IF NOT EXISTS settlement_item (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id  INTEGER NOT NULL REFERENCES settlement (id) ON DELETE CASCADE,
  commission_id  INTEGER NOT NULL REFERENCES commission_record (id),
  amount_cent    INTEGER NOT NULL,
  UNIQUE (settlement_id, commission_id)
);

-- ---------------------------------------------------------------------
-- 报表 / 实训
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_report (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id            INTEGER NOT NULL REFERENCES shop (id),
  report_date        TEXT    NOT NULL,
  timezone           TEXT    NOT NULL,
  orders_count       INTEGER NOT NULL DEFAULT 0,
  gmv_cent           INTEGER NOT NULL DEFAULT 0,
  refund_amount_cent INTEGER NOT NULL DEFAULT 0,
  top_product_id     INTEGER REFERENCES product (id),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (shop_id, report_date)
);

CREATE TABLE IF NOT EXISTS training_student (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  school     TEXT    NOT NULL,
  major      TEXT,
  phone      TEXT,
  status     TEXT    NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_task (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,
  points      INTEGER NOT NULL DEFAULT 100,
  due_date    TEXT,
  status      TEXT    NOT NULL DEFAULT 'OPEN',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_score (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES training_student (id),
  task_id    INTEGER NOT NULL REFERENCES training_task (id),
  score      INTEGER NOT NULL,
  feedback   TEXT,
  graded_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, task_id)
);

-- ---------------------------------------------------------------------
-- 索引：订单列表（1 万条量级）与看板聚合的关键路径
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_order_shop_created  ON platform_order (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_created       ON platform_order (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status        ON platform_order (status);
CREATE INDEX IF NOT EXISTS idx_order_item_order    ON platform_order_item (order_id);
CREATE INDEX IF NOT EXISTS idx_order_log_order     ON order_status_log (order_id);
CREATE INDEX IF NOT EXISTS idx_influencer_region   ON influencer (region, status);
CREATE INDEX IF NOT EXISTS idx_commission_influ    ON commission_record (influencer_id, status);
CREATE INDEX IF NOT EXISTS idx_commission_order    ON commission_record (order_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_influ     ON affiliate_link (influencer_id);
CREATE INDEX IF NOT EXISTS idx_live_session_shop   ON live_session (shop_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_metric_session ON live_metric (session_id, metric_at);
CREATE INDEX IF NOT EXISTS idx_inventory_product   ON inventory (product_id, shop_id);
CREATE INDEX IF NOT EXISTS idx_logistics_order     ON logistics_order (order_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_shop   ON daily_report (shop_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created       ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user          ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_score_std  ON training_score (student_id);
