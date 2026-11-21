-- =====================================================================
-- TikTok 跨境直播电商运营中台 · MySQL 8.0 建表脚本（生产参考）
-- ---------------------------------------------------------------------
-- 本地开发与自动化测试使用 SQLite（db/schema.sql），本文件是同一个数据模型的
-- MySQL 8 版本，用于把项目迁移到 MySQL 时直接执行：
--
--   mysql -uroot -p -e "CREATE DATABASE tiktok_hub DEFAULT CHARSET utf8mb4;"
--   mysql -uroot -p tiktok_hub < db/mysql/schema.sql
--   mysql -uroot -p tiktok_hub < db/mysql/seed.sql     # 如需种子数据
--
-- 与 SQLite 版的差异（迁移时需同步修改代码，详见 docs/database.md §7）：
--   1. INTEGER AUTOINCREMENT  -> BIGINT UNSIGNED AUTO_INCREMENT
--   2. TEXT 上不能直接建索引    -> 作为唯一键/索引的列改为 VARCHAR(n)
--   3. 时间统一 DATETIME（UTC）-> 应用层写入 UTC，连接参数需 timezone=+00:00
--   4. REAL（浮点汇率）        -> DECIMAL(18,6)，金额仍是 BIGINT 分
--   5. CHECK 约束             -> MySQL 8.0.16+ 真正生效（低于该版本会被忽略）
--   6. 下划线 LIKE 转义        -> 应用层的 LIKE 查询需注意 ESCAPE（SQLite 默认无差异）
--
-- 注意：本文件未在本机验证（机器无 MySQL / Docker），列为已知限制。
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 账号与系统
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_user (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)     NOT NULL COMMENT '登录名',
  password_hash VARCHAR(100)    NOT NULL COMMENT 'bcrypt(cost=10)',
  real_name     VARCHAR(64)     NOT NULL COMMENT '真实姓名',
  role          VARCHAR(16)     NOT NULL COMMENT 'ADMIN/OPERATOR/HOST/AGENCY',
  email         VARCHAR(128)             DEFAULT NULL,
  status        VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/DISABLED',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_user_username (username),
  CONSTRAINT ck_sys_user_role CHECK (role IN ('ADMIN', 'OPERATOR', 'HOST', 'AGENCY'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '系统用户';

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED          DEFAULT NULL,
  username    VARCHAR(64)              DEFAULT NULL,
  action      VARCHAR(64)     NOT NULL COMMENT 'PATCH inventory 这类「方法 资源」',
  resource    VARCHAR(64)     NOT NULL,
  resource_id VARCHAR(64)              DEFAULT NULL,
  method      VARCHAR(8)               DEFAULT NULL,
  path        VARCHAR(255)             DEFAULT NULL,
  ip          VARCHAR(64)              DEFAULT NULL,
  detail      TEXT                     DEFAULT NULL COMMENT '请求体快照（敏感字段已脱敏）',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_created (created_at DESC),
  KEY idx_audit_user (user_id, created_at DESC)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '操作审计日志';

CREATE TABLE IF NOT EXISTS sys_config (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  config_key   VARCHAR(128)    NOT NULL,
  config_value TEXT            NOT NULL,
  description  VARCHAR(255)             DEFAULT NULL,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_config_key (config_key)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '系统配置（业务常量可在线调整）';

-- ---------------------------------------------------------------------
-- 跨境基础能力：币种 / 汇率 / 店铺 / 站点
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currency (
  code           VARCHAR(8)  NOT NULL COMMENT 'USD/GBP/CNY/SGD',
  name           VARCHAR(64) NOT NULL,
  symbol         VARCHAR(8)  NOT NULL,
  decimal_digits TINYINT     NOT NULL DEFAULT 2,
  PRIMARY KEY (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '币种';

CREATE TABLE IF NOT EXISTS exchange_rate (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  base_currency  VARCHAR(8)      NOT NULL,
  quote_currency VARCHAR(8)      NOT NULL,
  rate           DECIMAL(18, 6)  NOT NULL COMMENT '1 base = rate quote',
  effective_date DATE            NOT NULL COMMENT '生效日；查询取 <= 业务日的最新一条',
  `source`       VARCHAR(16)     NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL/PLATFORM',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_rate_pair_date (base_currency, quote_currency, effective_date),
  KEY idx_rate_pair (base_currency, quote_currency, effective_date DESC)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '汇率（历史版本）';

CREATE TABLE IF NOT EXISTS shop (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_name        VARCHAR(128)    NOT NULL,
  platform         VARCHAR(32)     NOT NULL DEFAULT 'TIKTOK_SHOP',
  region           VARCHAR(8)      NOT NULL COMMENT 'US/UK/SEA',
  currency_code    VARCHAR(8)      NOT NULL,
  timezone         VARCHAR(64)     NOT NULL COMMENT 'IANA 时区，如 America/Los_Angeles',
  app_key          VARCHAR(64)              DEFAULT NULL,
  app_secret       VARCHAR(128)             DEFAULT NULL,
  access_token     VARCHAR(512)             DEFAULT NULL,
  token_expires_at DATETIME                 DEFAULT NULL,
  status           VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE' COMMENT 'PENDING/ACTIVE/EXPIRED',
  authorized_at    DATETIME                 DEFAULT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_shop_region (region, status),
  CONSTRAINT fk_shop_currency FOREIGN KEY (currency_code) REFERENCES currency (code),
  CONSTRAINT ck_shop_region CHECK (region IN ('US', 'UK', 'SEA'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT 'TikTok 店铺';

CREATE TABLE IF NOT EXISTS shop_site (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id       BIGINT UNSIGNED NOT NULL,
  site_code     VARCHAR(32)     NOT NULL COMMENT 'US-WEST/US-EAST/UK-LONDON/SEA-SG',
  site_name     VARCHAR(64)     NOT NULL,
  country       VARCHAR(8)      NOT NULL,
  currency_code VARCHAR(8)      NOT NULL,
  timezone      VARCHAR(64)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_site_shop_code (shop_id, site_code),
  CONSTRAINT fk_site_shop FOREIGN KEY (shop_id) REFERENCES shop (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '店铺下的站点';

-- ---------------------------------------------------------------------
-- 选品库：商品 / 成本明细 / 库存
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku             VARCHAR(64)     NOT NULL,
  title           VARCHAR(255)    NOT NULL,
  image_url       VARCHAR(512)             DEFAULT NULL,
  category        VARCHAR(64)     NOT NULL,
  cost_price_cent BIGINT          NOT NULL COMMENT '采购成本（分）',
  sale_price_cent BIGINT          NOT NULL COMMENT '跨境售价（分，按 currency_code）',
  currency_code   VARCHAR(8)      NOT NULL DEFAULT 'USD',
  weight_g        INT             NOT NULL DEFAULT 200,
  volume_cm3      INT                      DEFAULT NULL,
  commission_rate DECIMAL(6, 4)   NOT NULL DEFAULT 0.0500,
  shipping_mode   VARCHAR(16)     NOT NULL DEFAULT 'FBA',
  site_code       VARCHAR(32)              DEFAULT NULL,
  status          VARCHAR(16)     NOT NULL DEFAULT 'ON_SALE' COMMENT 'ON_SALE/ARCHIVED',
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_sku (sku),
  KEY idx_product_category (category, status),
  CONSTRAINT fk_product_currency FOREIGN KEY (currency_code) REFERENCES currency (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '商品/SKU';

CREATE TABLE IF NOT EXISTS product_cost (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id    BIGINT UNSIGNED NOT NULL,
  cost_type     VARCHAR(32)     NOT NULL COMMENT 'PURCHASE/FREIGHT/PACKAGING/CUSTOMS/OTHER',
  amount_cent   BIGINT          NOT NULL,
  currency_code VARCHAR(8)      NOT NULL DEFAULT 'USD',
  note          VARCHAR(255)             DEFAULT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cost_product (product_id),
  CONSTRAINT fk_cost_product FOREIGN KEY (product_id) REFERENCES product (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '商品成本明细';

CREATE TABLE IF NOT EXISTS inventory (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id    BIGINT UNSIGNED NOT NULL,
  shop_id       BIGINT UNSIGNED NOT NULL,
  available_qty INT             NOT NULL DEFAULT 0,
  safety_qty    INT             NOT NULL DEFAULT 20 COMMENT '安全库存，低于即告警',
  warehouse     VARCHAR(64)              DEFAULT NULL,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_inventory_product_shop (product_id, shop_id),
  KEY idx_inventory_product (product_id, shop_id),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES product (id),
  CONSTRAINT fk_inventory_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '库存（按商品 × 店铺）';

-- ---------------------------------------------------------------------
-- 直播域：场次 / 实时指标
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_session (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id         BIGINT UNSIGNED NOT NULL,
  title           VARCHAR(255)    NOT NULL,
  host_name       VARCHAR(64)     NOT NULL,
  scheduled_at    DATETIME        NOT NULL COMMENT 'UTC',
  duration_min    INT             NOT NULL DEFAULT 120,
  gmv_target_cent BIGINT          NOT NULL DEFAULT 0,
  actual_gmv_cent BIGINT          NOT NULL DEFAULT 0,
  status          VARCHAR(16)     NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/LIVE/ENDED/REVIEWED/CANCELLED',
  viewers         INT             NOT NULL DEFAULT 0,
  peak_online     INT             NOT NULL DEFAULT 0,
  orders_count    INT             NOT NULL DEFAULT 0,
  review_note     TEXT                     DEFAULT NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_live_session_shop (shop_id, scheduled_at DESC),
  CONSTRAINT fk_live_shop FOREIGN KEY (shop_id) REFERENCES shop (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '直播场次';

CREATE TABLE IF NOT EXISTS live_metric (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id      BIGINT UNSIGNED NOT NULL,
  metric_at       DATETIME        NOT NULL,
  online_count    INT             NOT NULL DEFAULT 0,
  gmv_cent        BIGINT          NOT NULL DEFAULT 0,
  orders          INT             NOT NULL DEFAULT 0,
  conversion_rate DECIMAL(6, 4)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_live_metric_session (session_id, metric_at),
  CONSTRAINT fk_metric_session FOREIGN KEY (session_id) REFERENCES live_session (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '直播实时打点';

-- ---------------------------------------------------------------------
-- 订单域：平台订单 / 明细 / 状态流水 / 物流
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_order (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id            BIGINT UNSIGNED NOT NULL,
  platform_order_id  VARCHAR(64)     NOT NULL COMMENT 'TikTok 平台订单号',
  status             VARCHAR(16)     NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/PAID/SHIPPED/DELIVERED/REFUNDING/REFUNDED/CANCELLED',
  buyer_name         VARCHAR(128)             DEFAULT NULL,
  currency_code      VARCHAR(8)      NOT NULL,
  total_amount_cent  BIGINT          NOT NULL COMMENT '原币金额（分）',
  exchange_rate_id   BIGINT UNSIGNED          DEFAULT NULL COMMENT '汇率快照',
  base_amount_cent   BIGINT          NOT NULL COMMENT '折算本位币（分）',
  site_code          VARCHAR(32)              DEFAULT NULL,
  paid_at            DATETIME                 DEFAULT NULL,
  shipped_at         DATETIME                 DEFAULT NULL,
  delivered_at       DATETIME                 DEFAULT NULL,
  refund_status      VARCHAR(16)              DEFAULT NULL COMMENT 'REQUESTED/APPROVED/REJECTED',
  refund_amount_cent BIGINT          NOT NULL DEFAULT 0,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_shop_platform (shop_id, platform_order_id) COMMENT '同步幂等的基石',
  KEY idx_order_shop_created (shop_id, created_at DESC),
  KEY idx_order_created (created_at DESC),
  KEY idx_order_status (status),
  CONSTRAINT fk_order_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_order_rate FOREIGN KEY (exchange_rate_id) REFERENCES exchange_rate (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '平台订单';

CREATE TABLE IF NOT EXISTS platform_order_item (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        BIGINT UNSIGNED NOT NULL,
  product_id      BIGINT UNSIGNED          DEFAULT NULL,
  sku             VARCHAR(64)     NOT NULL,
  title           VARCHAR(255)             DEFAULT NULL,
  quantity        INT             NOT NULL,
  unit_price_cent BIGINT          NOT NULL,
  subtotal_cent   BIGINT          NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_item_order (order_id),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES platform_order (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '订单明细';

CREATE TABLE IF NOT EXISTS order_status_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(16)              DEFAULT NULL,
  to_status   VARCHAR(16)     NOT NULL,
  `source`    VARCHAR(16)     NOT NULL DEFAULT 'SYNC' COMMENT 'SYNC/MANUAL/API',
  remark      VARCHAR(255)             DEFAULT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_log_order (order_id),
  CONSTRAINT fk_log_order FOREIGN KEY (order_id) REFERENCES platform_order (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '订单状态流水（时间线）';

CREATE TABLE IF NOT EXISTS logistics_order (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id         BIGINT UNSIGNED NOT NULL,
  `type`           VARCHAR(16)     NOT NULL COMMENT 'FIRST_LEG/LAST_LEG/RETURN',
  carrier          VARCHAR(64)     NOT NULL,
  tracking_no      VARCHAR(64)     NOT NULL,
  status           VARCHAR(16)     NOT NULL DEFAULT 'CREATED' COMMENT 'CREATED/PICKED_UP/IN_TRANSIT/CUSTOMS/DELIVERED/EXCEPTION',
  origin           VARCHAR(128)             DEFAULT NULL,
  destination      VARCHAR(128)             DEFAULT NULL,
  exception_flag   TINYINT(1)      NOT NULL DEFAULT 0,
  exception_reason VARCHAR(255)             DEFAULT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logistics_order (order_id),
  CONSTRAINT fk_logistics_order FOREIGN KEY (order_id) REFERENCES platform_order (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '跨境物流单';

-- ---------------------------------------------------------------------
-- 达人分销域：达人 / 寄样 / 专属链接 / 佣金 / 结算
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS influencer (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nickname        VARCHAR(128)    NOT NULL,
  handle          VARCHAR(64)     NOT NULL COMMENT '@beautybyava',
  followers       INT             NOT NULL DEFAULT 0,
  category        VARCHAR(64)     NOT NULL,
  commission_rate DECIMAL(6, 4)   NOT NULL DEFAULT 0.1000,
  total_gmv_cent  BIGINT          NOT NULL DEFAULT 0,
  region          VARCHAR(8)      NOT NULL DEFAULT 'US',
  status          VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/PENDING/DISABLED',
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_influencer_handle (handle),
  KEY idx_influencer_region (region, status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '达人/机构';

CREATE TABLE IF NOT EXISTS sample_shipment (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  influencer_id BIGINT UNSIGNED NOT NULL,
  product_id    BIGINT UNSIGNED NOT NULL,
  tracking_no   VARCHAR(64)              DEFAULT NULL,
  status        VARCHAR(16)     NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/SHIPPED/ARRIVED',
  shipped_at    DATETIME                 DEFAULT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sample_influ (influencer_id, status),
  CONSTRAINT fk_sample_influ FOREIGN KEY (influencer_id) REFERENCES influencer (id),
  CONSTRAINT fk_sample_product FOREIGN KEY (product_id) REFERENCES product (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '达人寄样';

CREATE TABLE IF NOT EXISTS affiliate_link (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  influencer_id BIGINT UNSIGNED NOT NULL,
  product_id    BIGINT UNSIGNED NOT NULL,
  link_code     VARCHAR(32)     NOT NULL COMMENT 'LK-US-XXXXXX',
  utm_source    VARCHAR(64)     NOT NULL DEFAULT 'tiktok',
  utm_medium    VARCHAR(64)     NOT NULL DEFAULT 'affiliate',
  utm_campaign  VARCHAR(64)              DEFAULT NULL,
  clicks        INT             NOT NULL DEFAULT 0,
  conversions   INT             NOT NULL DEFAULT 0,
  gmv_cent      BIGINT          NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_link_code (link_code),
  KEY idx_affiliate_influ (influencer_id),
  CONSTRAINT fk_link_influ FOREIGN KEY (influencer_id) REFERENCES influencer (id),
  CONSTRAINT fk_link_product FOREIGN KEY (product_id) REFERENCES product (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '达人专属推广链接';

CREATE TABLE IF NOT EXISTS commission_record (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  influencer_id          BIGINT UNSIGNED NOT NULL,
  order_id               BIGINT UNSIGNED NOT NULL,
  link_id                BIGINT UNSIGNED          DEFAULT NULL,
  gmv_cent               BIGINT          NOT NULL COMMENT '计佣基数（订单明细金额，分）',
  commission_rate        DECIMAL(6, 4)   NOT NULL,
  commission_amount_cent BIGINT          NOT NULL,
  currency_code          VARCHAR(8)      NOT NULL DEFAULT 'USD',
  status                 VARCHAR(16)     NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/CONFIRMED/SETTLED',
  created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_commission_influ_order (influencer_id, order_id) COMMENT '防重复计提',
  KEY idx_commission_influ (influencer_id, status),
  KEY idx_commission_order (order_id),
  CONSTRAINT fk_commission_influ FOREIGN KEY (influencer_id) REFERENCES influencer (id),
  CONSTRAINT fk_commission_order FOREIGN KEY (order_id) REFERENCES platform_order (id),
  CONSTRAINT fk_commission_link FOREIGN KEY (link_id) REFERENCES affiliate_link (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '佣金计提记录';

CREATE TABLE IF NOT EXISTS settlement (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  settlement_no          VARCHAR(32)     NOT NULL COMMENT 'ST + yyyyMMdd + 4 位',
  influencer_id          BIGINT UNSIGNED NOT NULL,
  period_start           DATE            NOT NULL,
  period_end             DATE            NOT NULL,
  total_gmv_cent         BIGINT          NOT NULL,
  commission_amount_cent BIGINT          NOT NULL,
  currency_code          VARCHAR(8)      NOT NULL DEFAULT 'USD',
  exchange_rate_id       BIGINT UNSIGNED          DEFAULT NULL COMMENT '结算汇率快照',
  base_amount_cent       BIGINT          NOT NULL,
  status                 VARCHAR(16)     NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PENDING/APPROVED/PAID',
  remark                 VARCHAR(255)             DEFAULT NULL,
  created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at                DATETIME                 DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_settlement_no (settlement_no),
  KEY idx_settlement_influ (influencer_id, status),
  CONSTRAINT fk_settlement_influ FOREIGN KEY (influencer_id) REFERENCES influencer (id),
  CONSTRAINT fk_settlement_rate FOREIGN KEY (exchange_rate_id) REFERENCES exchange_rate (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '佣金结算单';

CREATE TABLE IF NOT EXISTS settlement_item (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  settlement_id BIGINT UNSIGNED NOT NULL,
  commission_id BIGINT UNSIGNED NOT NULL,
  amount_cent   BIGINT          NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_settlement_item (settlement_id, commission_id) COMMENT '一张单里同一笔佣金只能出现一次',
  CONSTRAINT fk_settle_item_settle FOREIGN KEY (settlement_id) REFERENCES settlement (id) ON DELETE CASCADE,
  CONSTRAINT fk_settle_item_comm FOREIGN KEY (commission_id) REFERENCES commission_record (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '结算单明细';

-- ---------------------------------------------------------------------
-- 报表 / 实训
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_report (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id            BIGINT UNSIGNED NOT NULL,
  report_date        DATE            NOT NULL COMMENT '站点当地日期',
  timezone           VARCHAR(64)     NOT NULL,
  orders_count       INT             NOT NULL DEFAULT 0,
  gmv_cent           BIGINT          NOT NULL DEFAULT 0,
  refund_amount_cent BIGINT          NOT NULL DEFAULT 0,
  top_product_id     BIGINT UNSIGNED          DEFAULT NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_daily_shop_date (shop_id, report_date),
  KEY idx_daily_report_shop (shop_id, report_date DESC),
  CONSTRAINT fk_daily_shop FOREIGN KEY (shop_id) REFERENCES shop (id),
  CONSTRAINT fk_daily_product FOREIGN KEY (top_product_id) REFERENCES product (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '店铺日报（预聚合）';

CREATE TABLE IF NOT EXISTS training_student (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(64)     NOT NULL,
  school     VARCHAR(128)    NOT NULL,
  major      VARCHAR(64)              DEFAULT NULL,
  phone      VARCHAR(32)              DEFAULT NULL,
  status     VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/GRADUATED/DISABLED',
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_student_school (school, status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '实训学员';

CREATE TABLE IF NOT EXISTS training_task (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title       VARCHAR(255)    NOT NULL,
  description TEXT                     DEFAULT NULL,
  points      INT             NOT NULL DEFAULT 100 COMMENT '满分',
  due_date    DATE                     DEFAULT NULL,
  status      VARCHAR(16)     NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN/CLOSED',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '实训任务';

CREATE TABLE IF NOT EXISTS training_score (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  task_id    BIGINT UNSIGNED NOT NULL,
  score      INT             NOT NULL,
  feedback   VARCHAR(500)             DEFAULT NULL,
  graded_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_score_student_task (student_id, task_id),
  KEY idx_training_score_std (student_id),
  CONSTRAINT fk_score_student FOREIGN KEY (student_id) REFERENCES training_student (id),
  CONSTRAINT fk_score_task FOREIGN KEY (task_id) REFERENCES training_task (id),
  CONSTRAINT ck_score_range CHECK (score >= 0 AND score <= 100)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT '实训成绩';

SET FOREIGN_KEY_CHECKS = 1;
