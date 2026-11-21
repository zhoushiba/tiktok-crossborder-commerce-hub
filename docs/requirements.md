# 需求文档 · TikTok 跨境直播电商中台

> 对标：四川迅霆出海科技有限公司 · 全栈开发实习生
> 定位：把「选品 → 直播场次 → 订单同步 → 达人分销 → 多币种结算 → 数据看板」做成一条可运行的业务链，并完整留痕 AI 辅助开发过程。

---

## 1. 业务背景与目标

迅霆出海的主业是 **TikTok 跨境直播电商**，同时在宜宾临港与高校共建跨境直播实训基地。这类团队的真实痛点不是「再做一个电商后台」，而是：

1. **多店铺多站点**：美区、英区、东南亚三个站点各自有店铺、币种、时区，运营要在同一个后台切换查看；
2. **平台数据靠手工导**：订单、商品需要从 TikTok Shop 开放平台拉取，官方接口是游标分页 + 签名鉴权，容易拉重、拉漏；
3. **达人分销算不清**：达人佣金按明细计提，跨月结算要能追溯到每一笔订单和当时使用的汇率；
4. **人少活多**：实习生/运营要能快速上手，界面必须有真实数据、能演示、能讲解。

因此本项目的目标不是「功能最全」，而是**把跨境特有的坑（幂等、汇率快照、时区、签名）在代码里做对，并且能讲清楚**。

## 2. 角色与权限

| 角色 | 代码 | 能力范围 |
| --- | --- | --- |
| 管理员 | `ADMIN` | 全部权限；用户管理、审计日志统计、系统配置 |
| 运营 | `OPERATOR` | 商品/直播/订单/达人/结算/库存/实训的写操作；审计日志查看 |
| 主播 | `HOST` | 查看直播场次、开播/结束、实时打点；只读其他模块 |
| 机构代理 | `AGENCY` | 查看达人与佣金、结算单；不可执行写操作 |

实现位置：`backend/src/middlewares/auth.ts` 的 `requireRole()`（`ADMIN` 通吃），路由层逐个声明，例如
`backend/src/routes/settlements.ts` 的 `requireRole('OPERATOR')`。
前端角色标签与菜单可见性见 `frontend/src/layouts/MainLayout.vue` 与 `frontend/src/store/auth.ts`。

## 3. 功能需求（用户故事 + 验收标准）

> 验收标准统一使用 Given / When / Then 书写，并且**每条都有对应的自动化测试或真实接口调用**（见第 6 节）。

### FR-01 登录与账号

**用户故事**：作为员工，我希望能用账号密码登录后台，以便按角色看到我能做的操作。

- Given 数据库中存在种子账号 `admin/Admin@123`
- When 我 `POST /api/auth/login` 提交正确账号密码
- Then 返回 `code=0`，`data.token` 为 JWT，`data.user.role='ADMIN'`；错误密码返回 HTTP 401、`code=40100`，且**不区分「用户不存在」与「密码错误」**

实现：`backend/src/services/authService.ts`、`backend/src/routes/auth.ts`、`backend/tests/auth.test.ts`

### FR-02 多店铺与站点

**用户故事**：作为运营，我希望把美区/英区/东南亚的店铺集中管理，并看到授权状态。

- Given 种子数据含 4 个店铺（US 2 个、UK 1 个、SEA 1 个，其中 1 个为 `EXPIRED`）
- When 我 `GET /api/shops`
- Then 返回店铺列表，`app_secret`、`access_token` 字段被脱敏为 `******`，并带 `siteCount`、`orderCount`、`tokenValid`
- When 我 `POST /api/shops/1/authorize`
- Then 店铺状态变为 `ACTIVE`，`authorizedAt` 为当前时间，token 有效期 30 天

实现：`backend/src/services/shopService.ts`、`backend/src/repositories/shopRepo.ts`

### FR-03 多币种与汇率

**用户故事**：作为运营，我要把美元订单折算成人民币看总额，并且能追溯用的是哪一天的汇率。

- Given 汇率表含 `USD→CNY` 在 2026-11-01（7.10）与 2026-11-20（7.12）两条记录
- When 我 `POST /api/currencies/convert` 传 `{amountCent:10000, base:'USD', quote:'CNY', date:'2026-11-19'}`
- Then 返回 `rate=7.10`、`rateDate='2026-11-01'`（取「不晚于指定日期的最新一条」）
- And 订单落库时把 `exchange_rate_id` 一并写入，保证结算可追溯

实现：`backend/src/services/currencyService.ts`、`backend/src/repositories/currencyRepo.ts`（`latestRate`）

### FR-04 选品库与利润测算

**用户故事**：作为选品同学，我想在录入商品前先算清楚这单赚不赚。

- Given 售价 100 元、成本 40 元、重量 350g、达人佣金率 10%、平台费率 5%
- When 我 `POST /api/products/profit-calc`
- Then 头程运费 35 元、平台费 5 元、佣金 10 元、毛利 10 元、毛利率 10%、保本价 8824 分
- And 该结果有单元测试 `backend/tests/profit.test.ts` 覆盖边界（亏损商品 `profitable=false`）

实现：`backend/src/services/productService.ts` 的 `calculateProfit()` 与 `estimateFreightCent()`

### FR-05 商品 CSV 导入 / 导出

**用户故事**：作为运营，我要把供应商给的 Excel 名单一次性导进选品库，并且知道哪几行错了。

- Given CSV 表头 `sku,title,category,cost_price,sale_price,currency,weight_g`
- When 我导入 4 行（1 行合法、1 行 SKU 重复、1 行缺名称且单价非数字、1 行合法）
- Then 返回 `total=4, successCount=2, errorCount=2, status=PARTIAL`，`errors[].row` 是 **CSV 真实行号**（表头占第 1 行）
- And 导出 CSV 带 UTF-8 BOM，Excel 打开中文不乱码

实现：`backend/src/services/productService.ts` 的 `importCsv()` / `exportCsv()`、`backend/tests/products.test.ts`

### FR-06 直播场次与中控台

**用户故事**：作为主播，我要开播、实时看在线人数和成交额，播完做复盘。

- Given 一个 `PLANNED` 场次
- When 我 `POST /api/live-sessions/:id/status {status:'LIVE'}`，再 `POST /:id/metrics` 打点
- Then 场次状态变为 `LIVE`，`actual_gmv_cent/viewers/peak_online/orders_count` 累加，`live_metric` 追加一条
- When 我让 `PLANNED` 直接跳到 `ENDED`
- Then 返回 `code=40900`（非法状态流转），不会静默成功

实现：`backend/src/services/liveService.ts` 的 `ALLOWED_TRANSITIONS`、`backend/src/repositories/liveRepo.ts`

### FR-07 订单同步、去重与履约

**用户故事**：作为运营，我要一键从 TikTok Shop 拉单，重复拉不会产生重复订单。

- Given Mock 网关对 `shop 1` 共 9 单、单页上限 4 单，且第 2、3 页会**故意重发第 1 页的第一单**
- When 我 `POST /api/orders/sync {shopId:1, pageSize:4}`
- Then 返回 `pages=3, fetched=11, inserted=9, duplicated=2`
- And 再同步一次时 `inserted=0, duplicated=11`（幂等键 `shop_id + platform_order_id` 的 UNIQUE 约束生效）
- When 我对 `PAID` 订单发货并扣库存，库存不足时
- Then 返回 `code=40900`，且**不会**产生半成品物流单（事务回滚）

实现：`backend/src/services/orderService.ts` 的 `sync()/ship()/confirmDelivery()/refund()`、`backend/src/mock/app.ts`（重复单与游标）

### FR-08 达人分销与佣金计提

**用户故事**：作为运营，我要给达人算佣金，且同一单不能算两次。

- Given 达人 `@beautybyava` 佣金率 10%，某 `DELIVERED` 订单里有 2 个商品命中该达人的专属链接
- When 我 `POST /api/affiliates/orders/:orderId/accrue`
- Then 返回 `created` 数组（新建的佣金 id），金额 = 明细小计 × 10%
- When 我再调用一次
- Then `created.length === 0`，不重复计提
- And 订单未 `DELIVERED` 时计提被拒绝

实现：`backend/src/services/affiliateService.ts`、`backend/src/repositories/affiliateRepo.ts`（`insertCommissionIfAbsent`）

### FR-09 结算单与状态流转

**用户故事**：作为财务/运营，我要按月给达人出结算单，并锁定已结算的佣金。

- Given 某达人在统计周期内有 3 笔 `PENDING` 佣金
- When 我 `POST /api/settlements {influencerId, periodStart, periodEnd}`
- Then 生成结算单（`status='PENDING'`），明细写入 `settlement_item`，对应佣金置为 `CONFIRMED`，并按期末日汇率折算本位币
- When 我用同一周期再次生成
- Then 返回 `code=40900`（没有可结算佣金），不会重复出单
- When 我把结算单从 `PENDING` 直接改到 `PAID`
- Then 返回 `code=40900`；只有 `APPROVED → PAID` 合法，且 `PAID` 时把佣金置 `SETTLED`

实现：`backend/src/services/settlementService.ts` 的 `TRANSITIONS`、`backend/tests/settlement.test.ts`

### FR-10 库存与物流

**用户故事**：作为运营，我要知道哪些 SKU 快断货、哪些物流件异常。

- Given 种子数据中 4 个 SKU 低于安全库存、1 条物流单为 `EXCEPTION`
- When 我 `GET /api/inventory/low-stock`
- Then 返回 `{count, list}`，按缺口 `gap_qty` 倒序，`stock_level` 为 `LOW`/`OUT_OF_STOCK`
- When 我 `PATCH /api/inventory/adjust` 把库存改成负数
- Then 返回 `code=40000`

实现：`backend/src/services/inventoryService.ts`、`backend/src/repositories/inventoryRepo.ts`

### FR-11 数据看板

**用户故事**：作为负责人，我要一屏看到 GMV、订单量、客单价、站点占比、Top 商品、直播 ROI、待办。

- Given 种子数据 + 同步进来的订单
- When 我 `GET /api/dashboard/overview?days=14`
- Then 返回 `kpi/trend(14 天补齐)/siteShare/topProducts/shops/todo/liveRoi/statusDistribution`
- And 站点占比由 SQL 窗口函数 `SUM() OVER ()` 算出，直接可用于 ECharts 环形图

实现：`backend/src/services/dashboardService.ts`、`backend/src/repositories/reportRepo.ts`

### FR-12 实训基地管理

**用户故事**：作为带教老师，我要管理实训学员、任务和打分，这也是公司「高校实训基地」业务的数字化。

- Given 6 名学员、4 个任务、10 条成绩
- When 我 `GET /api/training/overview`
- Then 返回 `passRate`（均分 ≥75 的学员占比）、`students`、`tasks`、`scores`、完成率分子分母
- When 我给某人打分 200（超过任务满分）
- Then 返回 `code=40000`

实现：`backend/src/services/trainingService.ts`、`backend/src/repositories/trainingRepo.ts`、`frontend/src/views/TrainingView.vue`

### FR-13 操作日志审计

**用户故事**：作为管理员，我要知道谁在什么时候改了库存或结算单。

- Given 任意写接口（POST/PUT/PATCH/DELETE）成功返回 < 400
- When 我调用它
- Then `audit_log` 自动写入 `username/action/resource/resource_id/method/path/ip/detail`，`password/secret/token` 字段被脱敏
- And `GET /api/dashboard/audit-logs` 可按用户名、资源、动作过滤

实现：`backend/src/middlewares/observability.ts` 的 `auditTrail()`、`backend/src/repositories/trainingRepo.ts` 内导出的 `auditRepo`

### FR-14 国际化（中 / English）

**用户故事**：作为外贸团队，界面要能一键切英文给外籍同事看。

- Given 语言包共 **335 个 key**（中英各一份，TypeScript 用 `Record<keyof typeof zh, string>` 强制键对齐）
- When 点击右上角 `EN`
- Then 菜单、表头、按钮、状态文案整体切换，选择持久化在 `localStorage['tiktok-hub-locale']`

实现：`frontend/src/i18n/index.ts`

## 4. 非功能需求

| 类别 | 要求 | 落地方式 |
| --- | --- | --- |
| 统一响应 | 所有接口同一外壳 | `backend/src/utils/response.ts`：`{code,message,data,requestId,timestamp}` |
| 统一异常 | 业务错误可分类、不泄露堆栈 | `backend/src/middlewares/errorHandler.ts`（`ApiError` / `ZodError` / SQLite 约束错误映射） |
| 参数校验 | 所有写入接口校验 | `zod` schema 集中在 `backend/src/routes/schemas.ts`，`validateBody/validateQuery` 中间件 |
| 金额精度 | 不出现浮点误差 | 全部金额以「分」存 `INTEGER`，展示层 `frontend/src/utils/format.ts` |
| 时间 | 统一 UTC 存储，按站点时区展示 | `backend/src/utils/datetime.ts`；种子数据用 `datetime('now','-N day')` |
| 幂等 | 订单、佣金、结算不重复 | UNIQUE 约束 + `ON CONFLICT DO NOTHING` + 状态机校验 |
| 安全 | 密码哈希、JWT、签名、限流 | `bcryptjs`、`jsonwebtoken`、`backend/src/utils/sign.ts`、`backend/src/middlewares/rateLimit.ts` |
| 可观测 | 请求 ID、访问日志、审计 | `requestContext()` + `auditTrail()` |
| 接口文档 | 可交互 | `swagger-ui-express` 挂载 `/api/docs`，`backend/src/swagger.ts` |
| 可测试 | 测试不依赖外部服务 | `backend/tests/helpers.ts` 在内存库 + 随机端口 Mock 上跑真实 HTTP |

## 5. 任务拆解与估时（实际执行记录）

| 阶段 | 任务 | 估时 | 实际 |
| --- | --- | --- | --- |
| 需求 | 读 spec、拆 14 条功能、定数据模型 | 2h | 1.5h |
| 数据库 | 26 表 + 17 索引 + 种子（4 用户/4 店铺/12 商品/12 订单/5 佣金…） | 2h | 2.5h |
| 后端基础 | 配置/响应体/异常/日志/限流/JWT/校验 | 3h | 3h |
| 后端业务 | 13 个 service + 11 个 repository + 77 个接口 | 8h | 9h |
| Mock 网关 | token/orders/search 签名 + 游标 + 重复单 + 限流 | 2h | 2h |
| 测试 | 9 个文件 52 用例（含真实 HTTP 全链路） | 3h | 3.5h |
| 前端 | 11 个页面 + 组件 + i18n + ECharts | 8h | 8h |
| 文档/截图 | 9 篇文档 + README + 3 张真实截图 | 3h | 3h |
| **合计** | | **31h** | **32.5h** |

## 6. 验收结果（真实执行）

| 验收项 | 命令 | 结果 |
| --- | --- | --- |
| 后端类型检查 | `npm.cmd run type-check` | 通过（0 error） |
| 后端测试 | `npm.cmd test` | **9 个文件 / 52 用例全绿**，35.01s |
| 后端构建 | `npm.cmd run build` | 通过，产物在 `backend/dist` |
| 前端类型检查 | `npm.cmd run type-check` | 通过（vue-tsc，0 error） |
| 前端构建 | `npm.cmd run build` | 通过，`dist/index.html` 0.81kB + 分包 |
| 三服务启动 | `node dist/index.js` | api 3100 / mock 8091（3000 被占，见 README「已知限制」） |
| 真实业务链 | 登录 → 看板 → 同步订单 → 发货 → 计提佣金 → 出结算单 | 全部返回 `code=0` |
| 截图 | Edge headless | 3 张，见 `docs/screenshots/` |

## 7. 与岗位 JD 的逐条映射

| JD 原文要点 | 本项目实现位置 |
| --- | --- |
| 借助 AI 编程工具完成 Web 应用开发全流程（前端页面、后端接口、前后端联调、性能调优） | 全仓库；过程留痕 `docs/ai-workflow.md`；性能实测 `docs/performance.md` |
| 参与需求拆解，形成开发文档与代码注释 | 本文档 + `docs/architecture.md` / `database.md` / `api.md`；代码内中文注释 |
| 代码评审 | `docs/code-review.md`（15 条，含风险等级与修改结论） |
| HTML/CSS/JS + Vue 或 React | Vue 3.5 + TypeScript + Element Plus，`frontend/src/views/*.vue`（11 页）、`frontend/src/styles/index.css` |
| Python/Java/Node 至少一门 | Node 20+/24 + TypeScript，`backend/src/**`（58 个文件 / 4,926 行） |
| MySQL 或 MongoDB | SQLite（better-sqlite3）+ 附 MySQL 8 建表脚本 `db/mysql/schema.sql`；索引与执行计划 `docs/performance.md` |
| 熟练使用 AI 编程工具 | `docs/ai-workflow.md`：Prompt 模板、自检清单、6 个「AI 生成 → 人工修正」真实案例 |

## 8. 未纳入本期范围（明确排除）

- 真实对接 TikTok Shop 开放平台（需企业资质与 app 审核）→ 用同接口形状的 Mock 网关替代；
- 支付/提现通道、发票系统；
- 多租户与细粒度数据权限（当前按角色控制，未做行级隔离）；
- 列表虚拟滚动（当前为服务端分页，见 `docs/performance.md` 的后续方案）。
