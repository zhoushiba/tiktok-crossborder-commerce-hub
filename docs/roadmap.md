# 路线图 · TikTok 跨境直播电商中台

## 1. 已完成（本期交付）

### 跨境基础能力
- [x] 多店铺（TikTok Shop）× 多站点（US / UK / SEA），店铺授权与状态（ACTIVE / EXPIRED / PENDING）
- [x] 多币种：币种表 + 汇率表（含历史与手动覆盖），金额整数分存储 + `Intl` 风格格式化
- [x] 汇率快照：订单与结算单落 `exchange_rate_id` + 本位币金额，历史可追溯
- [x] 多时区：时间统一 UTC 存储，日报按「站点当地 0 点」聚合（`daily_report`）
- [x] i18n：中文 / English 双语，**335 个文案 key**，一键切换并持久化

### 业务域
- [x] 选品库：商品/SKU、成本项、类目聚合、CSV 导入（逐行校验 + 行号）、CSV 导出（BOM）
- [x] 利润测算器：售价/成本/头程运费（分段）/平台费/达人佣金 → 毛利、毛利率、保本价，**有单元测试**
- [x] 直播场次：排期、开播/结束/复盘状态机、实时打点、目标达成率、ROI 看板
- [x] 订单：Mock 网关拉单（签名 + 游标 + 幂等）、状态映射、超时未发货、发货扣库存、妥投、退款/退货
- [x] 达人分销：达人库、专属链接（UTM + 短码）、按订单计提佣金（幂等）、佣金状态机
- [x] 多币种结算：结算单生成（事务 + 汇率快照 + 佣金锁定）、状态流转、明细追溯
- [x] 库存与物流：安全库存告警、条件更新防超卖、头程/尾程物流单、异常件标记
- [x] 数据看板：GMV/订单量/客单价/退款率、站点占比（窗口函数）、Top 商品、直播 ROI、待办
- [x] 实训基地：学员、任务、成绩（upsert）、通过率与完成率
- [x] 操作日志审计：自动记录写操作、敏感字段脱敏、按人/资源/动作筛选

### 工程
- [x] 分层（routes / services / repositories）+ 统一响应体 + 统一异常 + zod 校验 + 请求 ID
- [x] JWT 鉴权 + 4 角色权限（ADMIN / OPERATOR / HOST / AGENCY）
- [x] 限流（600 次/分钟）+ 签名校验 + 时间戳防重放 + `timingSafeEqual`
- [x] Swagger UI（`/api/docs`，77 个接口）
- [x] 52 个后端测试（9 文件）全绿；后端 `type-check` / `build` 通过
- [x] 前端 11 个页面，`vue-tsc` 0 error，`vite build` 通过
- [x] 3 张真实截图（Edge headless）
- [x] 文档 9 篇 + README 12 节

## 2. 已知限制（诚实清单）

| 限制 | 影响 | 说明 |
| --- | --- | --- |
| 本机 3000/8090 端口被其他进程占用 | 演示改用 3100/8091 | 代码默认值仍是 3000/8090，通过 `API_PORT`/`MOCK_PORT` 覆盖 |
| MySQL 分支未在本机验证 | 生产切换需复测 | 机器上没有 MySQL/Docker；`db/mysql/schema.sql` 已按 MySQL 8 写好，差异清单见 `docs/database.md` §7 |
| Docker Compose 未实际运行 | 编排文件未验证 | 同上（无 Docker）；`backend/Dockerfile`、`frontend/Dockerfile` 已按标准多阶段构建编写 |
| 列表虚拟滚动未实现 | 单页 10~20 条足够 | 当前用服务端分页；虚拟滚动列入 §3 |
| 限流为单实例内存实现 | 多实例需改造 | 见 `docs/code-review.md` CR-15 |
| MongoDB 操作日志示例未落地 | 与 spec 的 E17 有偏差 | 审计日志落在 SQLite `audit_log`；Mongo 版本列入 §3 |
| 未接入真实 TikTok Shop 平台 | 用 Mock 替代 | 真实接入需企业资质与 app 审核；Mock 的接口形状、签名、错误码按官方风格实现 |
| 前端未做 E2E（Playwright） | 回归依赖人工 + 接口测试 | 列入 §3 |

## 3. 后续规划

### 近期（1~2 周，性价比最高）
1. **ECharts / Element Plus 按需引入**：`charts` 1.03 MB + `element` 1.1 MB 是目前首屏最大负担，按需后预计降到 400 KB 内。
2. **补 `(status, paid_at)` 复合索引**：`docs/performance.md` §2 已定位「超时未发货计数」选择性差，加索引后预期 < 1 ms。
3. **列表虚拟滚动**：订单/商品表在 `pageSize ≥ 100` 时接 `el-table-v2` 虚拟化。
4. **`docker compose up` 真机验证**：在装了 Docker 的环境跑一遍三服务编排，补 CI 步骤。

### 中期（1 个月）
5. **MySQL 实测 + 仓储抽象**：把 `repositories` 抽成接口，实现 SQLite / MySQL 两套，用环境变量切换；`ON CONFLICT` → `INSERT IGNORE` 自动化。
6. **MongoDB 审计/浏览流水**：审计日志与商品浏览行为写 Mongo（未装时降级写文件），对应 spec E17。
7. **Redis 限流 + 看板缓存**：多实例部署前提；看板 KPI 缓存 30s。
8. **E2E 测试**：Playwright 覆盖「登录 → 同步 → 发货 → 计提 → 结算」主链路。
9. **CI**：GitHub Actions 跑 `type-check + test + build`，PR 门禁。

### 长期（3 个月）
10. **真实平台对接**：TikTok Shop 正式 API（OAuth 授权、webhook 回调、订单/商品/退款全量同步），保留 Mock 作为本地开发替身。
11. **多租户与行级权限**：当前按角色控制，后续按 `shop_id` / `influencer_id` 做数据隔离。
12. **实时大屏**：WebSocket 推送直播中控台数据（当前为轮询/手动刷新）。
13. **对账系统**：平台账单 vs 本地订单 vs 结算单三方对账，差异自动告警。
14. **移动端适配**：主播用手机看中控台（当前为桌面优先）。

## 4. 版本记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| v1.0.0 | 2026-11-21 | 首个可运行版本：14 条功能、77 接口、52 测试、11 页面、9 篇文档、3 张截图 |
