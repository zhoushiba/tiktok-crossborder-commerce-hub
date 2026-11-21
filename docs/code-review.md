# 代码评审记录 · TikTok 跨境直播电商中台

> 评审对象：本仓库 `backend/` 与 `frontend/` 全部代码（58 + 23 个源文件）。
> 记录格式：编号 / 位置 / 问题 / 风险等级 / 结论与修改。
> 说明：这些不是「假想问题」，而是本次开发中真实出现或真实检查过的点；其中 6 条是 AI 生成后由人工发现并修掉的（与 `docs/ai-workflow.md` 的案例编号对应）。

## 汇总

| 等级 | 数量 | 含义 |
| --- | --- | --- |
| 🔴 高 | 6 | 会导致资损、越权或数据错乱，必须修 |
| 🟠 中 | 6 | 影响正确性/可维护性，应当修 |
| 🟡 低 | 3 | 一致性与体验问题，可择期修 |

---

## 🔴 CR-01 用户密码哈希可能被接口返回

- **位置**：`backend/src/repositories/userRepo.ts`、`backend/src/services/authService.ts`
- **问题**：用户表的 `password_hash` 与业务字段混在一行，`SELECT *` + 直接返回对象时会把哈希带到响应里。
- **风险**：🔴 高——bcrypt 哈希泄露可离线爆破，且是评审时必被问的安全项。
- **结论**：仓储层拆两个方法：`listSafe()` 显式列出不含 `password_hash` 的列；`findByUsername()` 仅供登录内部使用。`GET /auth/users` 走 `listSafe()`。
- **验证**：`backend/tests/auth.test.ts` 断言用户列表响应中不含 `passwordHash`/`password_hash`。

## 🔴 CR-02 平台拉单可能产生重复订单

- **位置**：`backend/src/services/orderService.ts` `sync()`、`db/schema.sql`
- **问题**：最初写法是「先 `SELECT` 判断是否存在，再 `INSERT`」，并发或重试时存在检查-插入竞态。
- **风险**：🔴 高——重复订单会直接导致 GMV、佣金重复计算。
- **结论**：改为数据库层幂等：`UNIQUE(shop_id, platform_order_id)` + `INSERT ... ON CONFLICT DO NOTHING`，以 `changes === 1` 判断是否新增。返回里区分 `inserted` / `duplicated`。
- **验证**：Mock 网关第 2 页起重发首单，测试断言 `fetched=11, inserted=9, duplicated=2`（`backend/tests/orders.test.ts`）。

## 🔴 CR-03 佣金可能被重复计提

- **位置**：`backend/src/services/affiliateService.ts` `accrueForOrder()`、`backend/src/repositories/affiliateRepo.ts`
- **问题**：运营可能对同一订单点两次「计提」；两个请求同时到达时更危险。
- **风险**：🔴 高——直接多发钱。
- **结论**：`UNIQUE(influencer_id, order_id)` + `insertCommissionIfAbsent()` 返回新建 id 数组；重复调用返回空数组，服务层据此返回「本次新增 0 条」。
- **验证**：`backend/tests/settlement.test.ts` 连续两次计提，断言第二次 `created.length === 0`。

## 🔴 CR-04 发货时的库存超卖

- **位置**：`backend/src/repositories/inventoryRepo.ts` `deduct()`、`backend/src/services/orderService.ts` `ship()`
- **问题**：`SELECT available_qty` 判断足够后再 `UPDATE` 扣减，两步之间可能被并发抢占。
- **风险**：🔴 高——超卖会导致退款与差评。
- **结论**：单语句原子扣减：
  `UPDATE inventory SET available_qty = available_qty - ? WHERE product_id=? AND shop_id=? AND available_qty >= ?`，`changes === 0` 即视为库存不足，整笔发货事务回滚。
- **验证**：`backend/tests/orders.test.ts` 用超量发货断言 `code=40900`，并断言未生成物流单。

## 🔴 CR-05 平台回调/接口缺少签名与重放保护

- **位置**：`backend/src/utils/sign.ts`、`backend/src/mock/app.ts`、`backend/src/services/tiktokClient.ts`
- **问题**：只比对 `sign` 字符串，未校验时间戳，且用了普通 `===` 比较。
- **风险**：🔴 高——可被重放攻击；字符串比较有时序侧信道。
- **结论**：`buildCanonicalString()`（过滤 `sign`/空值、字典序、拼 body）→ `hmacSign()`；校验时先用 `isTimestampFresh(ts, 300)` 拒绝过期请求，再用 `crypto.timingSafeEqual` 比对。错误分码：缺 sign `40100`、时间戳过期 `40101`、签名不符 `40102`。
- **验证**：`backend/tests/mockGateway.test.ts` 覆盖三种失败与一种成功。

## 🔴 CR-06 结算单可能"锁了佣金却没建单"

- **位置**：`backend/src/services/settlementService.ts` `create()`
- **问题**：建主表、写明细、把佣金改成 `CONFIRMED` 是三条语句，中途异常会留下不一致状态。
- **风险**：🔴 高——佣金被锁定但结算单不存在，达人永远收不到钱。
- **结论**：整段包进 `withTransaction()`；并且「取佣金 → 建单 → 改状态」在同一事务内完成，失败整体回滚。重复建单时因佣金已非 `PENDING` 而抛出 409。
- **验证**：`backend/tests/settlement.test.ts` 同周期二次建单断言 409。

---

## 🟠 CR-07 金额用浮点数会累积误差

- **位置**：全部金额字段、`backend/src/utils/money.ts`
- **问题**：早期用 `number` 存「元」，跨境换算 `*7.12` 后出现 `0.30000000000000004` 类误差。
- **风险**：🟠 中——对账差几分钱，财务不认。
- **结论**：统一「整数分」，换算 `Math.round(cent * rate)`；仅在响应里由 `centsToYuan()` 转成元并 `toFixed(2)`。数据库字段一律 `_cent` 尾缀，评审时一眼可辨。
- **验证**：`backend/tests/profit.test.ts` 断言毛利/保本价为精确整数分（1000 / 8824）。

## 🟠 CR-08 状态流转没有白名单

- **位置**：`backend/src/services/liveService.ts`、`orderService.ts`、`settlementService.ts`
- **问题**：早期任何 `status` 字符串都能写库，出现 `PLANNED` 直接变 `ENDED`、`PENDING` 直接 `PAID` 的脏数据。
- **风险**：🟠 中——业务规则形同虚设。
- **结论**：三处各定义显式转移表（`ALLOWED_TRANSITIONS` / `TRANSITIONS` / 订单 7 态白名单），非法流转抛 `40900` 并带上「当前状态 → 目标状态」。
- **验证**：`liveService` 与 `settlementService` 的测试各有用例。

## 🟠 CR-09 CSV 导入缺少行号与部分成功语义

- **位置**：`backend/src/services/productService.ts` `importCsv()`
- **问题**：早期「一行失败整批失败」，运营拿到 500 行文件却不知道哪行错。
- **风险**：🟠 中——可用性差，实际业务里必然被打回。
- **结论**：逐行 `try/catch` 收集 `{row, sku, message}`，`row` 为**文件真实行号**（表头算第 1 行）；返回 `total/successCount/errorCount/success[]/errors[]`，部分成功也返回 200 与 `PARTIAL` 语义，便于前端表格展示。
- **验证**：`backend/tests/products.test.ts` 构造 4 行数据，断言 `successCount=2, errorCount=2` 且错误类型含 `DUPLICATE/REQUIRED/FORMAT/NOT_FOUND`。

## 🟠 CR-10 列表接口的 N+1 隐患

- **位置**：`backend/src/repositories/orderRepo.ts` `list()`
- **问题**：早期为每条订单单独查「商品件数」和「店铺名」，20 条订单 = 41 次查询。
- **风险**：🟠 中——数据量一大就崩。
- **结论**：列表 SQL 里用 `LEFT JOIN shop` 取店名、用相关子查询 `(SELECT COUNT(1) FROM platform_order_item i WHERE i.order_id = o.id) AS item_count` 取件数，固定为 1 次查询。
- **验证**：`docs/performance.md` §3 的接口耗时（10 条订单 6~10 ms）。

## 🟠 CR-11 审计日志缺少脱敏与动作语义

- **位置**：`backend/src/middlewares/observability.ts` `auditTrail()`
- **问题**：`detail` 直接存请求体，登录请求会把明文密码写进日志；`action` 只存了 HTTP 方法，无法区分「改库存」与「改结算」。
- **风险**：🟠 中——日志本身成了泄露源。
- **结论**：递归过滤 `password/secret/token/authorization` 字段替换为 `***`；`action = "${method} ${resource}"`（如 `PATCH inventory`），`resource` 由路由声明；仅记录 `status < 400` 的请求，避免记录失败尝试中的敏感体。
- **验证**：`backend/tests/auth.test.ts` 断言登录后审计日志存在且不含明文密码。

## 🟠 CR-12 汇率取值的"当日"语义不明确

- **位置**：`backend/src/repositories/currencyRepo.ts` `latestRate()`
- **问题**：早期按 `ORDER BY id DESC LIMIT 1` 取汇率，历史订单重算时会用到未来汇率。
- **风险**：🟠 中——结算金额随时间漂移，无法审计。
- **结论**：改为 `WHERE effective_date <= ? ORDER BY effective_date DESC LIMIT 1`，并在订单/结算单上落 `exchange_rate_id`，实现「汇率快照」。
- **验证**：`backend/tests/currency.test.ts` 用 `date=2026-11-19` 断言取到 2026-11-01 的 7.10 而非 11-20 的 7.12。

---

## 🟡 CR-13 CSV 导出中文乱码

- **位置**：`backend/src/services/productService.ts` `exportCsv()`、`orderService.ts` `exportCsv()`
- **问题**：无 BOM 的 UTF-8 在 Excel 里显示为乱码（`æ¯›è€—`）。
- **风险**：🟡 低——体验问题，但演示时很扎眼。
- **结论**：响应体前缀 `\uFEFF`，`Content-Type: text/csv; charset=utf-8`。
- **验证**：`backend/tests/products.test.ts` 断言 `text.startsWith('\uFEFF')`。

## 🟡 CR-14 前端 `any` 与类型契约漂移

- **位置**：`frontend/src/views/*.vue`
- **问题**：后端在 VO 里补了 `*_yuan` 展示字段，前端 `Settlement` 接口没有这些字段，`vue-tsc` 报错；当时用 `as any` 绕过。
- **风险**：🟡 低——但会让类型检查失去意义。
- **结论**：把「接口返回」与「视图模型」分开：视图侧用 `ref<Record<string, any>>` 明确表示「后端附加字段」，而不是给 DTO 强塞可选字段；后端字段变更时同步更新 `frontend/src/api/index.ts` 的类型注释。
- **验证**：`npm.cmd run type-check`（vue-tsc）0 error。

## 🟡 CR-15 限流实现只对单实例有效

- **位置**：`backend/src/middlewares/rateLimit.ts`
- **问题**：内存 `Map` 计数，进程重启即清零，多实例各自计数。
- **风险**：🟡 低——当前单实例部署可接受。
- **结论**：保留实现但在文件头注释明确「仅单实例」；`docs/architecture.md` §9 与 `docs/performance.md` §6 将其列为已知取舍，roadmap 计划换 Redis 令牌桶。

---

## 评审检查清单（每次提交前自查）

- [x] 所有写入接口都有 zod 校验，参数不进 SQL 字符串拼接（全部预编译语句）
- [x] 涉及多表写入的路径都在事务里（发货、佣金、结算、导入）
- [x] 幂等键都在数据库层（UNIQUE + ON CONFLICT），不靠应用层「先查后写」
- [x] 状态变更走白名单，非法流转返回 409 而不是静默成功
- [x] 金额全部整数分，展示层才转元
- [x] 时间全部 UTC 存储，展示按站点时区
- [x] 敏感字段（密码哈希、app_secret、access_token）不出现在列表接口
- [x] 错误响应不包含堆栈与 SQL 片段
- [x] 新增接口同时补测试与 `docs/api.md`
- [x] 新增表同时补索引说明（`docs/database.md` §4）
