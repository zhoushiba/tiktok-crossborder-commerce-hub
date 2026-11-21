# AI 辅助开发全流程记录 · TikTok 跨境直播电商中台

> 这份文档回答面试官最关心的问题：**你用 AI 写了多少？你怎么保证它是对的？**
> 结论先放前面：AI 承担了约 70% 的**初稿**（脚手架、CRUD、样式、文档），但**每一条都经过人工验收**；本次开发中 AI 初稿有 **6 处真实缺陷** 被我发现并修正（见 §4），另有 5 类任务我判断不适合交给 AI（见 §5）。

## 1. 工具与分工

| 环节 | 工具 | 人的职责 |
| --- | --- | --- |
| 需求拆解 | 对话式 LLM（Claude / GPT） | 提供 spec、拍板取舍、写验收标准 |
| 后端代码 | LLM 生成 → 我改 | 定分层、定事务边界、定幂等键 |
| 前端页面 | LLM 生成 → 我改 | 定信息架构、配色、真实数据契约 |
| 测试 | LLM 生成 → 我补断言 | 决定「测什么才算过」 |
| 文档 | LLM 起草 → 我核对 | 所有数字必须来自真实执行 |
| 提交前检查 | 人工为主 | 跑 type-check / test / build / 截图 |

**原则：AI 可以写实现，但不能替我做判断。** 凡是「数字」「契约」「安全边界」，我一律自己核对。

## 2. 需求拆解 Prompt 模板

把 JD 和 spec 切成可验收任务时，我固定用这个模板：

```text
你是资深全栈工程师。下面是我的项目 spec 与目标岗位 JD。

【目标】把 spec 拆成可在 1 天内独立验收的任务，不要写代码。
【约束】
1. 每个任务必须有：编号、涉及文件、验收标准（Given/When/Then）、预计工时。
2. 验收标准必须可自动化验证（能写成测试或 curl），不许出现「界面美观」这类主观项。
3. 标注依赖关系：哪些任务必须先做（数据模型、鉴权、统一响应）。
4. 标注风险：哪些地方跨时区/跨币种/并发，容易出现隐性 bug。

【输入】
spec: <粘贴 p09 spec 全文>
JD: <粘贴岗位 JD>

【输出格式】
| 编号 | 任务 | 文件 | 验收标准 | 依赖 | 工时 | 风险 |
```

产出直接变成 `docs/requirements.md` 的第 3、5 节。这个模板的价值在于**强制写 Given/When/Then**——写不出来，说明需求还没想清楚。

## 3. 代码生成后的自检清单

AI 生成任何一段代码，我按这 8 条过一遍（顺序固定，越靠前越致命）：

1. **边界**：空数组、`null`、`0`、超大值、负数；（例：库存调整为负要 400；`pageSize` 上限 200）
2. **错误处理**：失败路径有没有返回值/抛错？错误码对不对？会不会把内部异常抛给前端？
3. **SQL**：是否全部参数化？有没有 `SELECT *` 带出敏感列？有没有在循环里查库（N+1）？
4. **并发/幂等**：重复提交会怎样？两个请求同时到达会怎样？（例：订单去重、佣金计提、结算建单）
5. **事务边界**：多表写入是否在同一个事务？失败是否整体回滚？
6. **时间/时区/金额**：UTC 存了吗？跨时区取"当地 0 点"了吗？金额是整数分吗？
7. **权限**：这个接口谁可以调？写操作有没有 `requireRole`？
8. **可观测**：日志里能定位到是谁、改了什么吗？敏感字段脱敏了吗？

> 实际执行：这 8 条在本次开发中抓出了 CR-01、CR-02、CR-03、CR-04、CR-06（见 `docs/code-review.md`）。

## 4. 六个真实案例：AI 生成 → 人工发现问题 → 修正

### 案例 1：ECharts 配置对象的 `as const` 让类型检查失败

- **AI 生成**：

```ts
const trendOption = computed(() => ({
  series: [{ type: 'line', data: points }],
} as const));
```

- **问题**：`vue-tsc` 报错 `Type 'readonly [...]' is not assignable to type 'EChartsOption'`。`as const` 把数组变成 readonly 元组，而 ECharts 的类型要求可变数组。
- **我的判断**：这不是「加个 as any」能解决的——`as const` 在这里没有任何收益（配置对象不被复用），反而是 AI 的习惯性动作。
- **修正**（`frontend/src/views/DashboardView.vue`、`LiveView.vue`）：

```ts
import type { EChartsOption } from 'echarts';
const trendOption = computed<EChartsOption>(() => ({
  series: [{ type: 'line', data: points }],
}));
```

- **收获**：给 AI 的约束里加一条「不要用 `as const` 修饰传给第三方库的配置对象」。共修 5 处（4 个 computed + 1 个 metricOption）。

### 案例 2：时间工具函数的签名与调用不匹配

- **AI 生成**：`const expiresAt = addDays(new Date(), 30);`
- **问题**：我自己的 `utils/datetime.ts` 里 `addDays(dateStr: string, days: number): string`，传 `Date` 直接类型报错 `TS2345`。
- **我的判断**：这是 AI 没有读我已有工具的签名，凭空猜 API。**AI 最常犯的错就是"以为你有个函数"**。
- **修正**（`backend/src/services/shopService.ts`）：

```ts
const expiresAt = `${addDays(toUtcString(new Date()).slice(0, 10), 30)} 00:00:00`;
```

- **收获**：给 AI 的上下文里必须贴**真实的工具函数签名**，不能只说「项目里有个日期工具」。

### 案例 3：Mock 服务的 429 变成了 500

- **AI 生成**：限流中间件 `next(ApiError.tooManyRequests(...))`。
- **问题**：测试断言「第 4 次请求返回 429」，实际拿到 **500**。原因：Mock 网关的 `createMockApp()` **没有挂错误处理中间件**，Express 默认错误处理器把 `ApiError` 当成未知错误返回 HTML 500。
- **我的判断**：`ApiError` 只有被 `errorHandler` 接住才有意义；AI 在 API 服务里挂了，在 Mock 服务里漏了。
- **修正**（`backend/src/mock/app.ts`）：

```ts
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (err as any)?.httpStatus ?? 500;
  const code = (err as any)?.code ?? 50000;
  res.status(status).json({ code, message: (err as Error)?.message ?? 'internal error' });
});
```

- **收获**：凡是「自己写中间件」的地方，都要检查**同类服务的装配是否一致**。

### 案例 4：测试断言字段名与 SQL 别名不一致

- **AI 生成**：`reportRepo.siteShare()` 用 `ROUND(gmv_cent * 100.0 / SUM(gmv_cent) OVER (), 2) AS ratio`；同时生成的测试断言 `item.amount_percent`。
- **问题**：测试拿到 `NaN`（字段不存在），断言 `expect(sum).toBeGreaterThanOrEqual(99)` 失败。
- **我的判断**：两边都是 AI 写的，**它自己和自己对不上**。这类问题只有跑测试才暴露。
- **修正**：以 SQL 为准（`ratio` 语义清晰、与前端环形图字段一致），改测试断言；并在 `docs/api.md` 的看板示例里写死字段名，作为契约。
- **收获**：**先定契约（文档/类型），再让 AI 分别写实现和测试**；否则两边会各自发明字段名。

### 案例 5：服务返回结构缺了前端要的字段

- **AI 生成**：`liveDashboard()` 返回 `{totalSessions, liveSessions, totalGmvYuan, ...}`；`auditService.statistics()` 返回 `{byResource, recent}`。
- **问题**：前端「直播罗盘」要 `sessions` 数组、「操作日志」页要 `total` 总数——都不存在，页面显示空/NaN。
- **我的判断**：AI 按「后端视角」设计返回体，没站在页面需求上。**联调阶段必须逐字段核对**。
- **修正**（`backend/src/services/dashboardService.ts`）：

```ts
sessions: rows.map((row) => ({
  ...row,
  actual_gmv_yuan: centsToYuan(row.actual_gmv_cent),
  achievement_rate: row.gmv_target_cent > 0 ? Math.round((row.actual_gmv_cent / row.gmv_target_cent) * 1000) / 10 : 0,
  on_track: row.gmv_target_cent > 0 && row.actual_gmv_cent / row.gmv_target_cent >= 0.8,
}))
```

以及 `statistics()` 补 `total`。两处都补了对应测试断言。

### 案例 6：导出 CSV 少了 BOM，Excel 打开是乱码

- **AI 生成**：`orderService.exportCsv()` 加了 `\uFEFF`，`productService.exportCsv()` 没加——同一个人（AI）写的两个文件，风格不一致。
- **问题**：测试断言 `text.startsWith('\uFEFF')` 失败。
- **修正**：`return '\uFEFF' + [header, ...rows].join('\n')`，并在两个 service 顶部加了统一注释说明「Excel 需要 BOM」。
- **收获**：**重复逻辑要抽公共函数**（后续可抽 `toCsv(rows)`），否则 AI 每次生成都会漏一处。

## 5. 哪些任务我没交给 AI

| 任务 | 原因 |
| --- | --- |
| 数据模型与幂等键设计 | 一旦定错（如用「先查后插」而非唯一约束），后面所有代码都建立在错误前提上；这类决策必须人拍板 |
| 事务边界 | AI 倾向于「每个方法一个事务」或干脆不管；跨境结算涉及「主表 + 明细 + 佣金状态」，边界错就是资损 |
| 验收标准的取舍 | 「测什么算过」是产品判断，AI 会把所有断言写成 `toBeDefined()` |
| 真实环境排错 | 例如本机 3000 端口被占、PowerShell 把 `-Dfile.encoding` 拆开——这类问题需要看真实报错现场 |
| 性能结论 | AI 会编「提升 10 倍」；本项目的数字全部来自 `bench-orders.mjs` 实测（含两个「没提升」的诚实结论） |

## 6. 量化结果

| 指标 | 数值 |
| --- | --- |
| 后端源文件 / 行数 | 58 个 / 4,926 行 |
| 前端源文件 / 行数 | 23 个 / 4,180 行 |
| 数据表 / 索引 | 26 张 / 17 个 |
| 接口数量 | 77 个 |
| 自动化测试 | 9 个文件 / 52 个用例，全绿（35.01s） |
| 真实截图 | 3 张（Edge headless，1440×900） |
| AI 初稿被人工修正 | 6 处（本文 §4）+ 3 处类型错误（`details` 字段缺失、`TS2871` 恒空表达式、`vite.config.ts` 缺 `@types/node`） |

## 7. 给下一个项目的改进

1. **先写契约再生成**：把 `docs/api.md` 的响应示例当作唯一事实来源，实现和测试都从它生成；
2. **类型即约束**：所有 service 出参用显式 `interface` 声明，不让 AI 用「返回对象字面量」的自由风格；
3. **测试先行**：至少对「幂等/状态机/金额」三类逻辑先写失败测试，再让 AI 补实现；
4. **统一工具层**：CSV、时间、金额这些高频小工具先收敛成 `utils/`，并在 Prompt 里贴签名，能显著降低案例 2、案例 6 这类错误。
