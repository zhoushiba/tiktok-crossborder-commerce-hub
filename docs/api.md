# 接口文档 · TikTok 跨境直播电商中台

- Base URL：`http://127.0.0.1:3100/api`（开发默认 3000，本机被占用时用 `API_PORT` 覆盖，README 已说明）
- 在线文档（Swagger UI）：`http://127.0.0.1:3100/api/docs`
- 全部接口共 **77 个**，返回统一外壳；除 `/auth/*` 与 `/system/*` 外均需 `Authorization: Bearer <token>`

## 1. 通用约定

### 1.1 响应外壳

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "requestId": "6b1f3c2e-...",
  "timestamp": "2026-11-21T17:00:00.000Z"
}
```

分页 `data` 结构：

```json
{ "list": [], "total": 21, "page": 1, "pageSize": 10, "totalPages": 3, "hasNext": true }
```

### 1.2 错误码

| HTTP | code | 含义 | 典型场景 |
| --- | --- | --- | --- |
| 400 | 40000 | 参数错误 | zod 校验失败、库存调整传负数 |
| 401 | 40100 | 未认证 | 缺 token、token 过期、密码错误 |
| 403 | 40300 | 无权限 | 非管理员访问用户列表、账号被禁用 |
| 404 | 40400 | 资源不存在 | 订单/商品不存在 |
| 409 | 40900 | 状态或唯一性冲突 | 库存不足、重复结算、非法状态流转 |
| 429 | 42900 | 触发限流 | 超过 600 次/分钟 |
| 500 | 50000 | 服务端异常 | 未预期错误（堆栈只进日志） |

错误示例：

```json
{ "code": 40900, "message": "库存不足，无法发货：TT-HOME-002（需要 3，剩余 1）", "requestId": "…", "timestamp": "…" }
```

### 1.3 鉴权与角色

| 标记 | 含义 |
| --- | --- |
| 公开 | 不需要 token |
| 登录 | 任意已登录角色 |
| 运营 | `OPERATOR` 或 `ADMIN` |
| 主播 | `HOST` 或 `ADMIN` |
| 管理员 | 仅 `ADMIN` |

## 2. 认证 `/api/auth`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 公开 | 注册（**不允许 ADMIN**），角色限 OPERATOR/HOST/AGENCY |
| POST | `/auth/login` | 公开 | 登录，返回 JWT（12h） |
| GET | `/auth/me` | 登录 | 当前用户信息 |
| GET | `/auth/users` | 管理员 | 用户列表（不含密码哈希） |
| POST | `/auth/users` | 管理员 | 新建用户（可指定任意角色） |

登录请求/响应：

```http
POST /api/auth/login
{ "username": "admin", "password": "Admin@123" }
```

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "tokenType": "Bearer",
    "expiresIn": "12h",
    "user": { "id": 1, "username": "admin", "role": "ADMIN", "realName": "周思远" }
  }
}
```

## 3. 系统 `/api/system`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/system/health` | 公开 | 健康检查：`status/env/database/shopCount/mockGateway/uptimeSeconds` |
| GET | `/system/config` | 运营 | 系统配置项列表 |
| POST | `/system/webhook/verify` | 公开 | 演示平台回调验签（HMAC + 时间戳防重放） |

## 4. 店铺与站点 `/api/shops`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/shops` | 登录 | 店铺列表（`app_secret`/`access_token` 脱敏，含 `siteCount/orderCount/tokenValid`） |
| GET | `/shops/:id` | 登录 | 店铺详情 |
| GET | `/shops/:id/sites` | 登录 | 站点列表 |
| POST | `/shops` | 运营 | 新建店铺（`region` 限 US/UK/SEA，自动补默认时区） |
| POST | `/shops/:id/authorize` | 运营 | 模拟授权：签发演示 token，有效期 30 天，状态置 ACTIVE |
| PATCH | `/shops/:id/status` | 运营 | 启用/停用（ACTIVE / EXPIRED） |

## 5. 币种与汇率 `/api/currencies`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/currencies` | 登录 | 币种列表 |
| GET | `/currencies/rates?base=&quote=&limit=` | 登录 | 汇率列表（附带 `pair`、`inverse`） |
| POST | `/currencies/convert` | 登录 | 金额换算（取「不晚于 date」的最新汇率，无正向则反算并标 `inverted`） |
| POST | `/currencies/rates` | 运营 | 新增/覆盖某日汇率（同币种或 rate≤0 → 400） |
| PATCH | `/currencies/rates/:id` | 运营 | 修正汇率 |

```http
POST /api/currencies/convert
{ "amountCent": 12999, "base": "USD", "quote": "CNY", "date": "2026-11-19" }
```

```json
{ "code": 0, "data": { "amountCent": 92293, "rate": 7.1, "rateDate": "2026-11-01", "base": "USD", "quote": "CNY", "inverted": false } }
```

## 6. 商品 `/api/products`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/products?keyword=&category=&status=&siteCode=&page=&pageSize=` | 登录 | 分页列表 |
| GET | `/products/categories` | 登录 | 类目聚合（含每类数量 `count`） |
| GET | `/products/export.csv` | 登录 | 导出 CSV（带 BOM，含毛利/毛利率列） |
| POST | `/products/profit-calc` | 登录 | 利润测算（可传 `productId` 复用商品参数） |
| POST | `/products/import` | 运营 | CSV 导入（逐行校验，返回成功/失败明细与行号） |
| GET | `/products/:id` | 登录 | 详情（含成本项、库存、利润） |
| GET | `/products/:id/profit` | 登录 | 该商品的利润测算结果 |
| POST | `/products` | 运营 | 新建商品 |
| PATCH | `/products/:id` | 运营 | 更新商品（白名单字段） |
| DELETE | `/products/:id` | 运营 | 软下架（`ARCHIVED`） |

利润测算请求（两种写法等价：页面按「元」输入，脚本/测试按「分」输入；带 `productId` 时未传的字段复用商品档案）：

```json
// 写法一：前端利润测算器（单位：元）
{ "salePrice": 100, "costPrice": 40, "weightG": 350, "commissionRate": 0.1, "currencyCode": "CNY" }

// 写法二：脚本/测试（单位：分）
{ "salePriceCent": 10000, "costPriceCent": 4000, "weightG": 350, "commissionRate": 0.1, "currencyCode": "CNY" }

// 写法三：复用商品参数，只覆盖重量与佣金
{ "productId": 1, "weightG": 400, "commissionRate": 0.12 }
```

响应（数值均为分/百分比，`gross_margin` 为百分数如 10 表示 10%）：

```json
{
  "code": 0,
  "data": {
    "currency_code": "CNY", "rate": 1,
    "sale_price_cent": 10000, "sale_price_cny_cent": 10000,
    "cost_cny_cent": 4000, "freight_cny_cent": 3500,
    "platform_fee_cny_cent": 500, "commission_cny_cent": 1000,
    "extra_cost_cny_cent": 0,
    "gross_profit_cny_cent": 1000, "gross_margin": 10, "net_margin": 10,
    "breakeven_price_cent": 8824, "profitable": true,
    "breakdown": ["售价", "采购成本", "头程运费", "平台费", "达人佣金", "毛利"]
  }
}
```

CSV 导入返回：

```json
{ "total": 4, "successCount": 2, "errorCount": 2,
  "success": [{ "sku": "MAT9001", "id": 13 }],
  "errors": [
    { "row": 3, "sku": "MAT0001", "message": "SKU 已存在" },
    { "row": 4, "sku": "MAT9002", "message": "单价必须是数字" }
  ] }
```

## 7. 直播 `/api/live-sessions`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/live-sessions?shopId=&status=` | 登录 | 场次列表（含 `achievement_rate`、`on_track`） |
| GET | `/live-sessions/upcoming` | 登录 | 待开播（按排期升序） |
| GET | `/live-sessions/:id` | 登录 | 详情 + 实时曲线 `metricSeries` |
| POST | `/live-sessions` | 运营/主播 | 新建场次 |
| POST | `/live-sessions/:id/status` | 运营/主播 | 状态流转（`PLANNED→LIVE→ENDED→REVIEWED`，非法→409） |
| POST | `/live-sessions/:id/metrics` | 运营/主播 | 实时打点（仅 LIVE 可打点） |
| POST | `/live-sessions/:id/review` | 运营 | 复盘（必须填 `reviewNote`） |

## 8. 订单 `/api/orders`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/orders?status=&shopId=&keyword=&from=&to=&overdueOnly=&page=&pageSize=` | 登录 | 分页列表（含 `total_amount_yuan`、`base_amount_yuan`、`overdue`） |
| GET | `/orders/export.csv` | 登录 | 导出 CSV（BOM，中文表头） |
| GET | `/orders/overdue` | 登录 | 超时未发货（PAID 且超 48h，含 `hours`） |
| POST | `/orders/sync` | 运营 | 从 Mock 网关拉单（幂等） |
| GET | `/orders/:id` | 登录 | 详情（扁平结构：订单字段 + `items/statusLogs/logistics/shop`） |
| POST | `/orders/:id/ship` | 运营 | 发货（可扣库存，库存不足 409） |
| POST | `/orders/:id/delivery` | 运营 | 确认妥投 |
| POST | `/orders/:id/refund` | 运营 | 退款/退货（REQUESTED/APPROVED/REJECTED，金额不得超订单额） |
| PATCH | `/orders/:id/status` | 运营 | 手工改状态（7 态白名单，同态→409） |

同步请求/响应（Mock 数据：9 单、单页上限 4、第 2 页起重发首单）：

```http
POST /api/orders/sync
{ "shopId": 1, "pageSize": 4 }
```

```json
{ "code": 0, "data": [ { "shopId": 1, "fetched": 11, "inserted": 9, "duplicated": 2, "failed": 0, "pages": 3, "errors": [] } ] }
```

## 9. 达人分销 `/api/affiliates`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/affiliates?keyword=&region=&status=` | 登录 | 达人列表（含 `total_gmv_yuan`、`pending_commission_yuan`、`roi`） |
| GET | `/affiliates/commissions?influencerId=&status=` | 登录 | 佣金列表 |
| GET | `/affiliates/summary` | 登录 | 佣金汇总（按状态） |
| GET | `/affiliates/:id` | 登录 | 达人详情 + 推广链接 + 汇总 |
| POST | `/affiliates` | 运营 | 新建达人（`handle` 必须 `@` 开头且唯一） |
| POST | `/affiliates/links` | 运营 | 生成专属链接（同达人同商品幂等返回已有） |
| POST | `/affiliates/:id/links` | 运营 | 同上（路径参数版） |
| POST | `/affiliates/orders/:orderId/accrue` | 运营 | 按订单计提佣金（仅 DELIVERED，幂等） |

```json
{ "code": 0, "data": { "created": [7, 8], "count": 2, "totalYuan": 35.98 } }
```

## 10. 结算 `/api/settlements`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/settlements?influencerId=&status=` | 登录 | 结算单列表 |
| GET | `/settlements/summary` | 登录 | 汇总（按状态 + 本月） |
| POST | `/settlements` | 运营 | 生成结算单（周期内 PENDING 佣金 → CONFIRMED） |
| GET | `/settlements/:id` | 登录 | 详情 + 明细 |
| PATCH | `/settlements/:id/status` | 运营 | `DRAFT→PENDING→APPROVED→PAID`（PAID 时佣金置 SETTLED） |

```http
POST /api/settlements
{ "influencerId": 3, "periodStart": "2026-11-01", "periodEnd": "2026-11-30", "remark": "11 月达人结算" }
```

```json
{ "code": 0, "message": "created", "data": {
  "id": 3, "settlement_no": "ST202611210003", "status": "PENDING",
  "commission_amount_cent": 20720, "base_amount_yuan": 1108.5, "items": [ { "commission_id": 3, "amount_cent": 20720 } ] } }
```

## 11. 库存与物流 `/api/inventory`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/inventory?shopId=&keyword=&lowStockOnly=` | 登录 | 库存列表（`stock_level`、`gap_qty`、`stock_value_yuan`） |
| GET | `/inventory/low-stock` | 登录 | 低库存（`{count, list}` 按缺口倒序） |
| GET | `/inventory/logistics?status=&exceptionOnly=` | 登录 | 物流单列表 |
| PATCH | `/inventory/adjust` | 运营 | 调整可售/安全库存（负数→400） |
| POST | `/inventory/logistics/:id/exception` | 运营 | 标记异常（必须填原因） |
| PATCH | `/inventory/logistics/:id/status` | 运营 | 推进物流状态（PICKED_UP/IN_TRANSIT/CUSTOMS/DELIVERED） |

## 12. 看板与审计 `/api/dashboard`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/dashboard/overview?days=14` | 登录 | 一屏数据：`kpi/trend/siteShare/topProducts/shops/todo/liveRoi/statusDistribution` |
| GET | `/dashboard/live` | 登录 | 直播罗盘（`totalSessions/liveSessions/sessions/totalGmvYuan/roi`） |
| GET | `/dashboard/todo` | 登录 | 运营待办（超时未发货、异常物流、低库存、待结算） |
| GET | `/dashboard/daily-reports?limit=14` | 登录 | 日报列表 |
| GET | `/dashboard/audit-logs?username=&resource=&action=` | 运营 | 审计日志 |
| GET | `/dashboard/audit-statistics` | 管理员 | 审计统计（`total/byResource/recent`） |

看板返回（节选）：

```json
{ "code": 0, "data": {
  "kpi": { "gmv_yuan": 17572.06, "order_count": 19, "aov_yuan": 924.84, "refund_yuan": 50, "refund_rate": 0.28,
           "live_gmv_yuan": 4348, "live_gmv_ratio": 19.84, "commission_pending_yuan": 47.84 },
  "trend": [ { "date": "2026-11-08", "gmv_yuan": 0, "order_count": 0 } ],
  "siteShare": [ { "region": "US", "region_label": "美区", "gmv_cent": 1380000, "ratio": 78.17 } ],
  "todo": { "overdue_shipment": 2, "exception_logistics": 1, "low_stock": 4, "pending_settlement": 1 }
} }
```

## 13. 实训 `/api/training`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/training/overview` | 登录 | 概览（`passRate/students/tasks/scores/statistics`） |
| GET | `/training/students` | 登录 | 学员列表（含 `graded_count/avg_score`） |
| POST | `/training/students` | 运营 | 新建学员 |
| GET | `/training/tasks` | 登录 | 任务列表 |
| POST | `/training/tasks` | 运营 | 新建任务（`points ≤ 100`） |
| GET | `/training/scores?studentId=&taskId=` | 登录 | 成绩列表 |
| POST | `/training/scores` | 运营 | 评分（0~100 且不超过任务满分，upsert） |

## 14. Mock 网关（独立端口 8091，不属于 `/api` 业务接口）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v2/health` | 网关健康 |
| POST | `/api/v2/token/get` | `{app_key, app_secret, grant_type}` → `access_token`（错误 401/40103） |
| GET | `/api/v2/orders/search` | 需 `sign`+`timestamp`+`access_token`；游标分页，`pageSize ≤ 4`，重发首单 |
| GET | `/api/v2/orders/detail` | 单笔详情 |
| POST | `/api/v2/products/sync` | 商品回传 |
| GET | `/api/v2/limit-demo` | 3 次/分钟，超限 429（演示退避重试） |

签名算法：

```
canonical = 参数按 key 字典序升序，过滤空值与 sign，拼成 k=v&k=v，末尾接 body 字符串
sign      = HMAC-SHA256(app_secret, canonical) 的十六进制
```

## 15. 用 curl 走一遍

```bash
# 1) 登录取 token
curl -s -X POST http://127.0.0.1:3100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'

# 2) 看板
curl -s "http://127.0.0.1:3100/api/dashboard/overview?days=14" -H "Authorization: Bearer $TOKEN"

# 3) 同步订单（幂等）
curl -s -X POST http://127.0.0.1:3100/api/orders/sync \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"shopId":1,"pageSize":4}'
```
