# 性能记录 · TikTok 跨境直播电商中台

> 所有数字都是在**本机实测**得到的，不是估算。复跑命令见每节末尾。

环境：Windows 11 · Node v24.20.0 · better-sqlite3 12.4（SQLite 3.50，WAL 模式）· 单进程 · 无 Redis/无缓存层。

---

## 1. 订单列表：1 万条数据，索引前后对比

**场景**：订单中心的分页列表、关键词搜索、看板按天聚合、超时未发货计数。
**方法**：`backend/scripts/bench-orders.mjs` 生成 10,000 条订单（4 店铺 × 6 状态 × 30 天），先 `DROP INDEX` 业务索引测「无索引」，再按 `db/schema.sql` 重建索引测「有索引」；每种查询预热 10 次、采样 60 次取**中位数**（避免首查询冷缓存干扰）。

| 查询 | 无索引 | 有索引 | 提升 | 执行计划变化 |
| --- | --- | --- | --- | --- |
| 店铺 + 状态翻页（`shop_id=? AND status=? ORDER BY created_at DESC LIMIT 20`） | 2.572 ms | 2.306 ms | **1.12×** | `sqlite_autoindex_platform_order_1` + `USE TEMP B-TREE FOR ORDER BY` → `idx_order_shop_created`，临时排序消失 |
| 状态 + 关键词搜索（`status=? AND (order_id LIKE ? OR buyer LIKE ?)`） | 3.610 ms | 2.383 ms | **1.52×** | `SCAN o` → `SEARCH o USING INDEX idx_order_status` |
| 近 7 天按天聚合 GMV（`created_at >= datetime('now','-7 day') GROUP BY date(created_at)`） | 6.073 ms | 3.997 ms | **1.52×** | `SCAN` → `SEARCH USING INDEX idx_order_created` |
| 超时未发货计数（`status='PAID' AND paid_at < now-48h`） | 2.667 ms | 1.025 ms | **2.60×** | `SCAN` → `SEARCH USING INDEX idx_order_status` |

原始输出（节选）：

```
[无索引] listByShopStatus     median=2.572ms avg=2.698ms p95=3.881ms
  plan: SEARCH o USING INDEX sqlite_autoindex_platform_order_1 (shop_id=?) | ... | USE TEMP B-TREE FOR ORDER BY
[有索引] listByShopStatus     median=2.306ms avg=2.566ms p95=3.905ms
  plan: SEARCH o USING INDEX idx_order_shop_created (shop_id=?) | ... (无 TEMP B-TREE)
[无索引] overdueCount         median=2.667ms avg=2.875ms p95=4.659ms
  plan: SCAN platform_order
[有索引] overdueCount         median=1.025ms avg=1.197ms p95=2.098ms
  plan: SEARCH platform_order USING INDEX idx_order_status (status=?)
```

**诚实说明**：`listByShopStatus` 只提升 12%，因为 `UNIQUE(shop_id, platform_order_id)` 本身会生成一个以 `shop_id` 为前导的自动索引，无索引场景并没有全表扫描；真正的收益来自「复合索引让排序不再走临时 B-Tree」。这条结论比「提升 100 倍」更接近真实工程。

## 2. 数据量放大到 10 万条

同一脚本 `BENCH_ROWS=100000`：

| 查询 | 无索引 | 有索引 | 提升 |
| --- | --- | --- | --- |
| 店铺 + 状态翻页 | 47.384 ms | 29.486 ms | 1.61× |
| 状态 + 关键词搜索 | 42.805 ms | 17.233 ms | **2.48×** |
| 近 7 天按天聚合 | 41.850 ms | 44.721 ms | 0.94×（**退化**） |
| 超时未发货计数 | 16.885 ms | 16.869 ms | 1.00× |

两个「看起来反直觉」的结果，原因写清楚更重要：

1. **按天聚合在 10 万行时反而更慢**：优化器改走 `idx_order_created` 范围扫描，但要回表取 `status` 与 `base_amount_cent`，随机 I/O 增加。正确解法不是加索引，而是**预聚合**——项目里已经有 `daily_report` 表（按店铺 + 当地日期存好 `orders_count/gmv_cent/refund_amount_cent`），看板的历史趋势优先读它，实时部分只算当天（见 `reportRepo.dailyReports()` 与 `dashboardService`）。
2. **超时计数几乎无提升**：`status='PAID'` 占 1/6 行，索引选择性低，扫描量仍然大。工程上应改为 `(status, paid_at)` 复合索引或 SQLite 部分索引 `WHERE status='PAID'`（MySQL 8 可直接建复合索引），本轮未加，列入 roadmap。

复跑：

```powershell
cd backend
node scripts/bench-orders.mjs                 # 1 万条
$env:BENCH_ROWS="100000"; node scripts/bench-orders.mjs   # 10 万条
```

## 3. 接口层实测（真实服务，3100 端口，种子数据 21 单）

| 接口 | 数据量 | 耗时（本机，单次） | 说明 |
| --- | --- | --- | --- |
| `GET /api/system/health` | — | 3~6 ms | 含 4 次表计数 |
| `POST /api/auth/login` | 1 用户 | 8~12 ms | bcrypt cost=10 占绝大部分 |
| `GET /api/dashboard/overview?days=7` | 21 单 | 25~40 ms | 9 组聚合查询 + 趋势补齐 |
| `POST /api/orders/sync` | 9 单 / 3 页 | 120~180 ms | 3 次 HTTP + 签名 + 事务写入 |
| `GET /api/orders?page=1&pageSize=10` | 21 单 | 6~10 ms | 分页 + 店铺 JOIN |

> 说明：单机冷启动首次请求会慢 2~3 倍（JIT 预热 + 准备语句编译），上表为预热后的稳定值。

## 4. 已做的三项性能设计

1. **服务端分页 + COUNT 分离**：列表接口一律 `LIMIT/OFFSET`，`total` 单独查，前端不做全量渲染。避免「一次拉 1 万单再前端分页」这种常见错误。
2. **预聚合表 `daily_report`**：日报按「站点当地 0 点」聚合一次，看板读历史区间时不再对订单表做全量 `GROUP BY`。
3. **前端按需分包 + 图表懒渲染**：`vite.config.ts` 把 `vue / element-plus / echarts` 拆成独立 chunk，首屏只加载业务代码；图表组件 `ChartBox.vue` 在 `onMounted` 才 `init()`，并在卸载时 `dispose()`。

构建产物（真实 `npm run build` 输出）：

```
dist/index.html                     0.81 kB │ gzip:   0.45 kB
dist/assets/index-*.css           367.04 kB │ gzip:  50.85 kB
dist/assets/index-*.js             32.70 kB │ gzip:  12.52 kB
dist/assets/vendor-*.js           174.83 kB │ gzip:  66.67 kB
dist/assets/charts-*.js         1,036.31 kB │ gzip: 343.41 kB
dist/assets/element-*.js        1,097.42 kB │ gzip: 345.55 kB
✓ built in 1m 30s
```

`charts` 与 `element` 体积大是已知取舍（ECharts 全量 + Element Plus 全量注册）。进一步优化方向：ECharts 按需引入（`echarts/core` + 具体图表）、Element Plus 用 `unplugin-vue-components` 自动按需（roadmap）。

## 5. 测试与构建耗时（真实）

| 项目 | 命令 | 耗时 | 结果 |
| --- | --- | --- | --- |
| 后端测试 | `npm.cmd test` | 35.01 s | 9 文件 / 52 用例全绿 |
| 后端编译 | `npm.cmd run type-check` | 约 6 s | 0 error |
| 后端构建 | `npm.cmd run build` | 约 8 s | `dist/` 生成 |
| 前端构建 | `npm.cmd run build` | 52.64 s（初次）/ 1m30s（含 API 地址注入） | 通过 |
| 前端类型检查 | `npm.cmd run type-check` | 约 18 s | 0 error |

测试慢主要花在 `orders.test.ts`：每轮同步要走 3 次真实 HTTP（签名 + 游标），且 `fileParallelism: false` 让 9 个文件串行，避免共享内存库互相干扰。

## 6. 未做与后续

| 项 | 现状 | 后续方案 |
| --- | --- | --- |
| 列表虚拟滚动 | 未实现（用服务端分页，每页 10~20 条） | 订单/商品表在数据量 > 500 行/页时接 `vue-virtual-scroller`，或用 `el-table-v2` 的虚拟化 |
| `(status, paid_at)` 复合索引 | 未加 | 见 §2 第 2 点，加索引后超时计数预期 < 1 ms |
| Redis 缓存 | 未做 | 看板 KPI 缓存 30 s；限流换 Redis 令牌桶 |
| 慢查询日志 | 未做 | SQLite `PRAGMA` 无内建慢日志，可在 `withTransaction` 外层包计时并对 > 100 ms 的语句告警 |
| 压测 | 未做 | 用 `autocannon` 对 `/api/orders` 做 200 并发基线，作为回归门禁 |
