-- =====================================================================
-- TikTok 跨境直播电商运营中台 · 种子数据（SQLite）
-- ---------------------------------------------------------------------
-- 所有时间用相对时间（datetime('now','-N day')）生成，
-- 这样任何时候重置数据库，看板都有"最近 30 天"的真实数据，不会演成空页面。
-- 金额单位：分。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 账号（密码均为 bcrypt 哈希：admin/Admin@123 等，见 README 默认账号）
-- ---------------------------------------------------------------------
INSERT INTO sys_user (id, username, password_hash, real_name, role, email, status) VALUES
(1, 'admin',    '$2a$10$en9bokkLRlVrCgnYr603tOLZFKlHiCtWhXT30z/yirkCqwlaPqBJe', '周思远', 'ADMIN',    'admin@xunxing.example',    'ACTIVE'),
(2, 'operator', '$2a$10$Ok7X0yaRJBwZkC0Y5c/HSehvA25qLtORp59/gDmfSFtv8cVxPnM0K', '林可欣', 'OPERATOR', 'operator@xunxing.example', 'ACTIVE'),
(3, 'host',     '$2a$10$75Ck9wCppoZDbyuP0u8jQuQraLnestPFVLYUvtNlx1Hz5lc4xTVQy', 'Lily Chen', 'HOST',   'lily@xunxing.example',     'ACTIVE'),
(4, 'agency',   '$2a$10$fqNSqq18XIRUbLTJwgl6o.0g8krlv5RVd0LwuHTH0IbQoAZlXf3EK', '陈嘉豪', 'AGENCY',   'agency@xunxing.example',   'ACTIVE');

-- ---------------------------------------------------------------------
-- 币种与汇率（rate 语义：1 单位 base_currency 折算为 rate 单位 quote_currency）
-- ---------------------------------------------------------------------
INSERT INTO currency (code, name, symbol, decimal_digits) VALUES
('USD', '美元 US Dollar',        '$',  2),
('GBP', '英镑 British Pound',    '£',  2),
('CNY', '人民币 Chinese Yuan',   '¥',  2),
('SGD', '新加坡元 Singapore Dollar', 'S$', 2);

INSERT INTO exchange_rate (id, base_currency, quote_currency, rate, effective_date, source) VALUES
(1, 'USD', 'CNY', 7.1000, '2026-11-01', 'MANUAL'),
(2, 'GBP', 'CNY', 9.0200, '2026-11-01', 'MANUAL'),
(3, 'SGD', 'CNY', 5.3200, '2026-11-01', 'MANUAL'),
(4, 'USD', 'GBP', 0.7870, '2026-11-01', 'MANUAL'),
(5, 'USD', 'SGD', 1.3300, '2026-11-01', 'MANUAL'),
(6, 'USD', 'CNY', 7.1200, '2026-11-20', 'MANUAL'),
(7, 'GBP', 'CNY', 9.0500, '2026-11-20', 'MANUAL'),
(8, 'SGD', 'CNY', 5.3500, '2026-11-20', 'MANUAL'),
(9, 'USD', 'GBP', 0.7880, '2026-11-20', 'MANUAL'),
(10, 'USD', 'SGD', 1.3350, '2026-11-20', 'MANUAL');

-- ---------------------------------------------------------------------
-- 店铺与站点：美区 / 英区 / 东南亚
-- ---------------------------------------------------------------------
INSERT INTO shop (id, shop_name, platform, region, currency_code, timezone, app_key, app_secret, access_token, token_expires_at, status, authorized_at) VALUES
(1, 'US Flagship Beauty Store', 'TIKTOK_SHOP', 'US',  'USD', 'America/Los_Angeles', 'tt-app-key-demo', 'tt-app-secret-demo', 'mock-access-token-us',  datetime('now', '+30 day'), 'ACTIVE', datetime('now', '-40 day')),
(2, 'UK Live Home Store',       'TIKTOK_SHOP', 'UK',  'GBP', 'Europe/London',        'tt-app-key-demo', 'tt-app-secret-demo', 'mock-access-token-uk',  datetime('now', '+30 day'), 'ACTIVE', datetime('now', '-35 day')),
(3, 'SEA Gadget Hub',           'TIKTOK_SHOP', 'SEA', 'SGD', 'Asia/Singapore',       'tt-app-key-demo', 'tt-app-secret-demo', 'mock-access-token-sea', datetime('now', '+30 day'), 'ACTIVE', datetime('now', '-20 day')),
(4, 'US Brand Outlet',          'TIKTOK_SHOP', 'US',  'USD', 'America/New_York',     'tt-app-key-demo', 'tt-app-secret-demo', NULL,                    NULL,                        'EXPIRED', datetime('now', '-90 day'));

INSERT INTO shop_site (id, shop_id, site_code, site_name, country, currency_code, timezone) VALUES
(1, 1, 'US-WEST',    '美西站',      'US', 'USD', 'America/Los_Angeles'),
(2, 1, 'US-EAST',    '美东站',      'US', 'USD', 'America/New_York'),
(3, 2, 'UK-LONDON',  '伦敦站',      'GB', 'GBP', 'Europe/London'),
(4, 3, 'SEA-SG',     '新加坡站',    'SG', 'SGD', 'Asia/Singapore');

-- ---------------------------------------------------------------------
-- 选品库
-- ---------------------------------------------------------------------
INSERT INTO product (id, sku, title, image_url, category, cost_price_cent, sale_price_cent, currency_code, weight_g, volume_cm3, commission_rate, shipping_mode, site_code, status) VALUES
(1,  'TT-BEAUTY-001', '玻尿酸保湿精华液 30ml',      '/images/p1.svg', 'BEAUTY', 1200, 2999, 'USD', 350,  320,  0.08, 'FBA',  'US-WEST', 'ON_SALE'),
(2,  'TT-BEAUTY-002', '声波洁面仪 IPX7 防水',        '/images/p2.svg', 'BEAUTY', 2800, 5999, 'USD', 480,  640,  0.08, 'FBA',  'US-WEST', 'ON_SALE'),
(3,  'TT-HOME-001',   '可折叠收纳箱 60L',            '/images/p3.svg', 'HOME',    900, 2450, 'USD', 1200, 4800, 0.06, 'FBA',  'US-EAST', 'ON_SALE'),
(4,  'TT-HOME-002',   '香薰蜡烛礼盒 3 件装',          '/images/p4.svg', 'HOME',   1100, 3299, 'USD',  650, 1800, 0.06, 'FBA',  'US-EAST', 'ON_SALE'),
(5,  'TT-3C-001',     '磁吸充电宝 10000mAh',          '/images/p5.svg', '3C',     3200, 8999, 'USD',  420,  380,  0.10, 'SELF', 'SEA-SG',  'ON_SALE'),
(6,  'TT-3C-002',     '蓝牙降噪耳机 Pro',             '/images/p6.svg', '3C',     4500, 12999, 'USD', 260,  420,  0.10, 'SELF', 'SEA-SG',  'ON_SALE'),
(7,  'TT-BEAUTY-003', '丝绒唇釉 6 色套装',            '/images/p7.svg', 'BEAUTY', 1500, 3999, 'USD',  220,  260,  0.08, 'FBA',  'US-WEST', 'ON_SALE'),
(8,  'TT-HOME-003',   '便携手持挂烫机',               '/images/p8.svg', 'HOME',   3600, 7999, 'USD', 1800, 5600, 0.06, 'SELF', 'UK-LONDON','ON_SALE'),
(9,  'TT-3C-003',     '桌面折叠手机支架',             '/images/p9.svg', '3C',      300, 1299, 'USD',  180,  300, 0.10, 'FBA',  'SEA-SG',  'ON_SALE'),
(10, 'TT-BEAUTY-004', '大地色眼影盘 12 色',           '/images/p10.svg','BEAUTY',  900, 2699, 'USD',  200,  240, 0.08, 'FBA',  'US-WEST', 'ON_SALE'),
(11, 'TT-HOME-004',   '旅行收纳袋 6 件套',            '/images/p11.svg','HOME',    700, 2199, 'USD',  500, 1500, 0.06, 'FBA',  'UK-LONDON','ON_SALE'),
(12, 'TT-3C-004',     '无线键鼠套装 静音版',          '/images/p12.svg','3C',     2600, 6999, 'USD',  900, 2600, 0.10, 'SELF', 'US-EAST', 'OFF_SALE');

INSERT INTO product_cost (product_id, cost_type, amount_cent, currency_code, note) VALUES
(1, 'PACKAGING', 60, 'USD', '礼盒 + 气泡袋'),
(2, 'PACKAGING', 80, 'USD', '防震内衬'),
(5, 'OTHER', 120, 'USD', '带电产品空运附加费'),
(6, 'OTHER', 150, 'USD', '锂电池认证分摊');

-- 库存：部分 SKU 故意低于安全库存，用于演示告警
INSERT INTO inventory (product_id, shop_id, available_qty, safety_qty, warehouse) VALUES
(1, 1, 320, 50, 'LA-01'),
(2, 1, 180, 40, 'LA-01'),
(3, 1, 8,   30, 'NJ-02'),
(4, 1, 240, 40, 'NJ-02'),
(5, 3, 96,  30, 'SG-01'),
(6, 3, 12,  25, 'SG-01'),
(7, 1, 400, 60, 'LA-01'),
(8, 2, 64,  20, 'LON-01'),
(9, 3, 520, 100,'SG-01'),
(10, 1, 15, 20, 'LA-01'),
(11, 2, 130, 30, 'LON-01'),
(12, 1, 0,  10, 'NJ-02');

-- ---------------------------------------------------------------------
-- 直播场次与实时指标
-- ---------------------------------------------------------------------
INSERT INTO live_session (id, shop_id, title, host_name, scheduled_at, duration_min, gmv_target_cent, actual_gmv_cent, status, viewers, peak_online, orders_count, review_note) VALUES
(1, 1, '黑五预热 · 美妆爆品专场', 'Lily Chen', datetime('now', '-2 hour'), 180, 500000, 128800, 'LIVE',    5400, 820, 46, NULL),
(2, 1, '周末家居好物直播',        'Lily Chen', datetime('now', '+1 day'),  120, 300000, 0,      'PLANNED', 0,    0,   0,  NULL),
(3, 2, 'London Home Live',        'Emma',      datetime('now', '-1 day'),  150, 200000, 210000, 'ENDED',   6100, 930, 58, NULL),
(4, 3, '新加坡 3C 爆品夜',        'Kai',       datetime('now', '-3 day'),  120, 180000, 96000,  'REVIEWED',3800, 540, 27, '流量主要来自推荐页，3C 客单价高但转化偏低，下次需要更强的价格锚点');

INSERT INTO live_metric (session_id, metric_at, online_count, gmv_cent, orders, conversion_rate) VALUES
(1, datetime('now', '-110 minute'), 120,  8600,  3, 0.0210),
(1, datetime('now', '-90 minute'),  340,  21400, 8, 0.0280),
(1, datetime('now', '-70 minute'),  520,  38600, 14, 0.0310),
(1, datetime('now', '-50 minute'),  680,  55200, 21, 0.0330),
(1, datetime('now', '-30 minute'),  760,  76400, 30, 0.0350),
(1, datetime('now', '-10 minute'),  820,  128800, 46, 0.0360),
(3, datetime('now', '-26 hour'),    210,  28000, 7, 0.0220),
(3, datetime('now', '-24 hour'),    640,  98000, 26, 0.0300),
(3, datetime('now', '-22 hour'),    930,  168000, 48, 0.0340),
(3, datetime('now', '-21 hour'),    880,  210000, 58, 0.0350);

-- ---------------------------------------------------------------------
-- 达人分销
-- ---------------------------------------------------------------------
INSERT INTO influencer (id, nickname, handle, followers, category, commission_rate, total_gmv_cent, region, status) VALUES
(1, 'Ava Beauty',     '@beautybyava',  128000, 'BEAUTY', 0.10, 129900, 'US',  'ACTIVE'),
(2, 'James Home',     '@homemate.uk',  86000,  'HOME',   0.10, 899000, 'UK',  'ACTIVE'),
(3, 'Kai Tech',       '@techwithkai',  210000, '3C',     0.12, 259000, 'SEA', 'ACTIVE'),
(4, 'Mia Glow',       '@glowwithmia',  54000,  'BEAUTY', 0.08, 45900,  'US',  'ACTIVE'),
(5, 'SG Gadget Lab',  '@sgadgetlab',   97000,  '3C',     0.08, 259000, 'SEA', 'ACTIVE'),
(6, 'London Living',  '@londonliving', 43000,  'HOME',   0.09, 158000, 'UK',  'PENDING');

INSERT INTO affiliate_link (id, influencer_id, product_id, link_code, utm_source, utm_medium, utm_campaign, clicks, conversions, gmv_cent) VALUES
(1, 1, 1,  'LK-US-AVA001', 'tiktok', 'affiliate', 'blackfriday-2026', 4200, 86, 257914),
(2, 1, 7,  'LK-US-AVA002', 'tiktok', 'affiliate', 'blackfriday-2026', 2100, 43, 171957),
(3, 2, 3,  'LK-UK-HOME01', 'tiktok', 'affiliate', 'home-q4',          1500, 32,  78400),
(4, 3, 6,  'LK-SEA-KAI01', 'tiktok', 'affiliate', '3c-night',         3300, 64, 831936),
(5, 3, 5,  'LK-SEA-KAI02', 'tiktok', 'affiliate', '3c-night',         2700, 51, 458949),
(6, 4, 2,  'LK-US-MIA001', 'tiktok', 'affiliate', 'beauty-week',       980, 18,  107982),
(7, 5, 9,  'LK-SEA-SGL01', 'tiktok', 'affiliate', 'gadget-deal',      1600, 39,  50661),
(8, 6, 11, 'LK-UK-LON01',  'tiktok', 'affiliate', 'travel-essentials', 740,  14,  30786);

INSERT INTO sample_shipment (influencer_id, product_id, tracking_no, status, shipped_at) VALUES
(1, 1, 'SF20261101001', 'RECEIVED', datetime('now', '-12 day')),
(3, 6, 'SF20261102002', 'SHIPPED',  datetime('now', '-9 day')),
(4, 2, 'SF20261103003', 'SHIPPED',  datetime('now', '-8 day')),
(6, 11,'SF20261104004', 'PENDING',  NULL);

-- ---------------------------------------------------------------------
-- 平台订单（金额/汇率快照与 shop 币种一致）
-- ---------------------------------------------------------------------
INSERT INTO platform_order (id, shop_id, platform_order_id, status, buyer_name, currency_code, total_amount_cent, exchange_rate_id, base_amount_cent, site_code, paid_at, shipped_at, delivered_at, refund_status, refund_amount_cent, created_at) VALUES
(1,  1, 'TT-20261118-0001', 'PAID',      'Ava Johnson',  'USD', 12990, 6, 92489,  'US-WEST',   datetime('now', '-2 day'), NULL, NULL, 'NONE', 0, datetime('now', '-2 day')),
(2,  1, 'TT-20261118-0002', 'SHIPPED',   'Michael Lee',  'USD', 25980, 6, 184978, 'US-WEST',   datetime('now', '-3 day'), datetime('now', '-1 day'), NULL, 'NONE', 0, datetime('now', '-3 day')),
(3,  1, 'TT-20261118-0003', 'DELIVERED', 'Sofia Garcia', 'USD', 7990,  6, 56889,  'US-EAST',   datetime('now', '-5 day'), datetime('now', '-4 day'), datetime('now', '-1 day'), 'NONE', 0, datetime('now', '-5 day')),
(4,  1, 'TT-20261118-0004', 'REFUNDING', 'Daniel Kim',   'USD', 4590,  6, 32681,  'US-WEST',   datetime('now', '-4 day'), datetime('now', '-2 day'), NULL, 'REQUESTED', 0, datetime('now', '-4 day')),
(5,  1, 'TT-20261118-0005', 'DELIVERED', 'Emma Brown',   'USD', 18990, 6, 135209, 'US-WEST',   datetime('now', '-7 day'), datetime('now', '-6 day'), datetime('now', '-2 day'), 'NONE', 0, datetime('now', '-7 day')),
(6,  2, 'TT-20261118-0006', 'PAID',      'Oliver Smith', 'GBP', 8990,  7, 81360,  'UK-LONDON', datetime('now', '-1 day'), NULL, NULL, 'NONE', 0, datetime('now', '-1 day')),
(7,  2, 'TT-20261118-0007', 'DELIVERED', 'Amelia Jones', 'GBP', 4599,  7, 41621,  'UK-LONDON', datetime('now', '-6 day'), datetime('now', '-5 day'), datetime('now', '-2 day'), 'NONE', 0, datetime('now', '-6 day')),
(8,  3, 'TT-20261118-0008', 'DELIVERED', 'Wei Tan',      'SGD', 25900, 8, 138565, 'SEA-SG',    datetime('now', '-8 day'), datetime('now', '-7 day'), datetime('now', '-4 day'), 'APPROVED', 5000, datetime('now', '-8 day')),
(9,  3, 'TT-20261118-0009', 'SHIPPED',   'Nur Aisyah',   'SGD', 9900,  8, 52965,  'SEA-SG',    datetime('now', '-3 day'), datetime('now', '-2 day'), NULL, 'NONE', 0, datetime('now', '-3 day')),
(10, 3, 'TT-20261118-0010', 'PENDING',   'Rizky Putra',  'SGD', 12900, 8, 69015,  'SEA-SG',    NULL, NULL, NULL, 'NONE', 0, datetime('now', '-6 hour')),
(11, 3, 'TT-20261118-0011', 'CANCELLED', 'Mei Ling',     'SGD', 3980,  8, 21293,  'SEA-SG',    NULL, NULL, NULL, 'NONE', 0, datetime('now', '-9 day')),
(12, 1, 'TT-20261118-0012', 'PAID',      'Chris Wong',   'USD', 15800, 6, 112496, 'US-EAST',   datetime('now', '-10 hour'), NULL, NULL, 'NONE', 0, datetime('now', '-10 hour'));

INSERT INTO platform_order_item (order_id, product_id, sku, title, quantity, unit_price_cent, subtotal_cent) VALUES
(1,  1,  'TT-BEAUTY-001', '玻尿酸保湿精华液 30ml', 2, 2999,  5998),
(1,  7,  'TT-BEAUTY-003', '丝绒唇釉 6 色套装',     1, 3999,  3999),
(1,  10, 'TT-BEAUTY-004', '大地色眼影盘 12 色',    1, 2699,  2699),
(2,  2,  'TT-BEAUTY-002', '声波洁面仪 IPX7 防水',  2, 5999,  11998),
(2,  1,  'TT-BEAUTY-001', '玻尿酸保湿精华液 30ml', 2, 2999,  5998),
(3,  4,  'TT-HOME-002',   '香薰蜡烛礼盒 3 件装',   2, 3299,  6598),
(4,  3,  'TT-HOME-001',   '可折叠收纳箱 60L',      1, 2450,  2450),
(5,  6,  'TT-3C-002',     '蓝牙降噪耳机 Pro',      1, 12999, 12999),
(5,  5,  'TT-3C-001',     '磁吸充电宝 10000mAh',   1, 5991,  5991),
(6,  8,  'TT-HOME-003',   '便携手持挂烫机',        1, 7990,  7990),
(6,  11, 'TT-HOME-004',   '旅行收纳袋 6 件套',     1, 1000,  1000),
(7,  11, 'TT-HOME-004',   '旅行收纳袋 6 件套',     2, 2199,  4398),
(8,  6,  'TT-3C-002',     '蓝牙降噪耳机 Pro',      2, 12950, 25900),
(9,  5,  'TT-3C-001',     '磁吸充电宝 10000mAh',   1, 8999,  8999),
(10, 9,  'TT-3C-003',     '桌面折叠手机支架',      3, 1299,  3897),
(10, 5,  'TT-3C-001',     '磁吸充电宝 10000mAh',   1, 8999,  8999),
(11, 9,  'TT-3C-003',     '桌面折叠手机支架',      1, 1299,  1299),
(12, 2,  'TT-BEAUTY-002', '声波洁面仪 IPX7 防水',  2, 5999,  11998),
(12, 7,  'TT-BEAUTY-003', '丝绒唇釉 6 色套装',     1, 3802,  3802);

INSERT INTO order_status_log (order_id, from_status, to_status, source, remark, created_at) VALUES
(1, NULL, 'PENDING', 'SYNC', '平台拉单创建', datetime('now', '-2 day')),
(1, 'PENDING', 'PAID', 'SYNC', '买家支付成功', datetime('now', '-2 day')),
(2, NULL, 'PENDING', 'SYNC', '平台拉单创建', datetime('now', '-3 day')),
(2, 'PENDING', 'PAID', 'SYNC', '买家支付成功', datetime('now', '-3 day')),
(2, 'PAID', 'SHIPPED', 'MANUAL', '美西仓出库，SF 单号已回传', datetime('now', '-1 day')),
(3, 'PAID', 'SHIPPED', 'SYNC', '平台标记已发货', datetime('now', '-4 day')),
(3, 'SHIPPED', 'DELIVERED', 'SYNC', '买家签收', datetime('now', '-1 day')),
(4, 'PAID', 'SHIPPED', 'SYNC', '平台标记已发货', datetime('now', '-2 day')),
(4, 'SHIPPED', 'REFUNDING', 'MANUAL', '买家申请退货：尺码不符', datetime('now', '-1 day')),
(8, 'DELIVERED', 'DELIVERED', 'MANUAL', '部分退款已通过：质量问题', datetime('now', '-3 day'));

INSERT INTO logistics_order (order_id, type, carrier, tracking_no, status, origin, destination, exception_flag, exception_reason) VALUES
(2, 'FIRST_LEG', 'YunExpress', 'YT20261118001', 'IN_TRANSIT', 'Shenzhen, CN', 'Los Angeles, US', 0, NULL),
(2, 'LAST_LEG',  'USPS',       'USPS9410812',   'IN_TRANSIT', 'Los Angeles, US', 'Seattle, US', 0, NULL),
(3, 'LAST_LEG',  'UPS',        'UPS1Z999A01',   'DELIVERED',  'New Jersey, US', 'Boston, US', 0, NULL),
(4, 'LAST_LEG',  'FedEx',      'FDX778899001',  'EXCEPTION',  'Los Angeles, US', 'San Diego, US', 1, '地址不详细，派送失败待联系买家'),
(8, 'FIRST_LEG', 'DHL',        'DHL5566778899', 'DELIVERED',  'Shenzhen, CN', 'Singapore, SG', 0, NULL),
(9, 'FIRST_LEG', 'NinjaVan',   'NV20261119001', 'IN_TRANSIT', 'Singapore, SG', 'Kuala Lumpur, MY', 0, NULL);

-- ---------------------------------------------------------------------
-- 佣金与结算（金额 = GMV × 达人佣金率）
-- ---------------------------------------------------------------------
INSERT INTO commission_record (id, influencer_id, order_id, link_id, gmv_cent, commission_rate, commission_amount_cent, currency_code, status, created_at) VALUES
(1, 1, 1,  1, 12990, 0.10, 1299, 'USD', 'PENDING', datetime('now', '-2 day')),
(2, 3, 2,  4, 25980, 0.12, 3118, 'USD', 'PENDING', datetime('now', '-3 day')),
(3, 5, 8,  7, 25900, 0.08, 2072, 'SGD', 'CONFIRMED', datetime('now', '-8 day')),
(4, 4, 4,  6, 4590,  0.08, 367,  'USD', 'PENDING', datetime('now', '-4 day')),
(5, 2, 6,  3, 8990,  0.10, 899,  'GBP', 'SETTLED', datetime('now', '-1 day'));

INSERT INTO settlement (id, settlement_no, influencer_id, period_start, period_end, total_gmv_cent, commission_amount_cent, currency_code, exchange_rate_id, base_amount_cent, status, remark, paid_at) VALUES
(1, 'ST202611200001', 3, '2026-11-01', '2026-11-20', 25900, 2072, 'SGD', 8, 11085, 'PENDING', '东南亚 3C 专场佣金', NULL),
(2, 'ST202611150002', 2, '2026-11-01', '2026-11-15', 8990,  899,  'GBP', 7, 8136,  'PAID',    '英区家居首场佣金', datetime('now', '-2 day'));

INSERT INTO settlement_item (settlement_id, commission_id, amount_cent) VALUES
(1, 3, 2072),
(2, 5, 899);

-- ---------------------------------------------------------------------
-- 日报 / 实训 / 审计 / 配置
-- ---------------------------------------------------------------------
INSERT INTO daily_report (shop_id, report_date, timezone, orders_count, gmv_cent, refund_amount_cent, top_product_id) VALUES
(1, date('now', '-1 day'), 'America/Los_Angeles', 6, 58990, 0,     1),
(2, date('now', '-1 day'), 'Europe/London',       3, 13589, 0,     8),
(3, date('now', '-1 day'), 'Asia/Singapore',      5, 48799, 5000,  6);

INSERT INTO training_student (id, name, school, major, phone, status) VALUES
(1, '李思彤', '宜宾学院', '电子商务', '13800000001', 'ACTIVE'),
(2, '王浩然', '宜宾职业技术学院', '跨境电商', '13800000002', 'ACTIVE'),
(3, '张梦洁', '成都信息工程大学', '计算机科学与技术', '13800000003', 'ACTIVE'),
(4, '陈子昂', '宜宾学院', '软件工程', '13800000004', 'ACTIVE'),
(5, '刘芸', '四川轻化工大学', '国际经济与贸易', '13800000005', 'GRADUATED'),
(6, '赵一鸣', '宜宾职业技术学院', '大数据技术', '13800000006', 'ACTIVE');

INSERT INTO training_task (id, title, description, points, due_date, status) VALUES
(1, 'TikTok Shop 后台建店与授权', '完成店铺注册、类目申请、ERP 授权三件事，截图提交', 100, '2026-11-10', 'OPEN'),
(2, '选品利润测算作业', '任选 5 个 SKU 用利润测算器算出毛利率并给出定价建议', 100, '2026-11-18', 'OPEN'),
(3, '直播中控台实操', '配合主播完成 1 场 60 分钟直播，记录在线人数与转化', 120, '2026-11-25', 'OPEN'),
(4, '跨境物流异常处理', '针对 3 个异常件写出处理路径与话术', 80,  '2026-12-02', 'OPEN');

INSERT INTO training_score (student_id, task_id, score, feedback, graded_at) VALUES
(1, 1, 92, '授权流程完整，截图规范', datetime('now', '-6 day')),
(2, 1, 85, '类目申请理由写得太简略', datetime('now', '-6 day')),
(3, 1, 96, '额外整理了常见驳回原因，值得分享', datetime('now', '-6 day')),
(1, 2, 88, '定价建议合理，缺少竞品对比', datetime('now', '-2 day')),
(4, 2, 78, '毛利率公式用错了物流成本口径', datetime('now', '-2 day')),
(5, 2, 91, '数据完整，结论清晰', datetime('now', '-2 day')),
(2, 3, 84, '中控台操作熟练，互动话术需加强', datetime('now', '-1 day')),
(3, 3, 95, '临场反应好，能接住主播抛的梗', datetime('now', '-1 day')),
(6, 1, 73, '授权 token 过期没处理', datetime('now', '-5 day')),
(6, 2, 81, '测算逻辑正确，成本漏了包材', datetime('now', '-1 day'));

INSERT INTO audit_log (user_id, username, action, resource, resource_id, method, path, ip, detail, created_at) VALUES
(1, 'admin',    'POST 店铺授权',   'shop',       '1', 'POST', '/api/shops/1/authorize', '127.0.0.1', '{"note":"mock 授权"}', datetime('now', '-3 day')),
(2, 'operator', 'POST 订单同步',   'order',      '',  'POST', '/api/orders/sync',       '127.0.0.1', '{"shopId":1}',           datetime('now', '-2 day')),
(1, 'admin',    'PUT 汇率更新',    'exchange_rate', '6', 'PUT', '/api/currencies/rates/6', '127.0.0.1', '{"rate":7.12}',       datetime('now', '-2 day')),
(2, 'operator', 'POST 佣金结算',   'settlement', '1', 'POST', '/api/settlements',       '127.0.0.1', '{"influencerId":3}',     datetime('now', '-1 day')),
(3, 'host',     'PUT 场次状态',    'live_session', '1', 'PUT', '/api/live-sessions/1/status', '127.0.0.1', '{"status":"LIVE"}', datetime('now', '-1 day'));

INSERT INTO sys_config (config_key, config_value, description) VALUES
('BASE_CURRENCY',        'CNY',  '结算本位币，所有报表换算到该币种'),
('ORDER_SYNC_PAGE_SIZE', '50',   '订单同步分页大小'),
('REFUND_WINDOW_DAYS',   '7',    '售后退款窗口（天）'),
('COMMISSION_MIN_PAYOUT','5000', '达人佣金起提门槛（分）'),
('LIVE_ROI_ALERT',       '0.80', '直播 ROI 低于该值进入复盘清单'),
('DEFAULT_TIMEZONE',     'UTC',  '未指定时区时的兜底时区');
