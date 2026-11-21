// 订单列表性能基准：对比「无索引 / 有索引」在 1 万条订单下的查询耗时。
// 用法：cd backend && node scripts/bench-orders.mjs
// 结果用于 docs/performance.md；脚本会在 backend/data/bench.db 生成临时库（已在 .gitignore 中忽略）。
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const root = path.resolve(backendRoot, '..');
const dbFile = path.join(backendRoot, 'data', 'bench.db');

fs.mkdirSync(path.dirname(dbFile), { recursive: true });
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'));

const ORDER_INDEXES = ['idx_order_shop_created', 'idx_order_created', 'idx_order_status'];

// 造订单：4 个店铺、6 种状态、30 天时间分布；行数可用 BENCH_ROWS 覆盖（默认 1 万）
const ROWS = Number(process.env.BENCH_ROWS ?? 10000);
const shops = [1, 2, 3, 4];
const statuses = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'REFUNDING', 'CANCELLED'];
const insert = db.prepare(
  `INSERT INTO platform_order
   (shop_id, platform_order_id, status, buyer_name, currency_code, total_amount_cent, base_amount_cent, site_code, paid_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`
);
// 基准库只需要币种/店铺维度，不跑完整 seed
for (const [code, name, symbol] of [
  ['USD', 'US Dollar', '$'],
  ['GBP', 'Pound Sterling', '£'],
  ['CNY', 'Chinese Yuan', '¥'],
  ['SGD', 'Singapore Dollar', 'S$'],
]) {
  db.prepare('INSERT INTO currency (code, name, symbol) VALUES (?, ?, ?)').run(code, name, symbol);
}
for (const id of [1, 2, 3, 4]) {
  db.prepare(
    `INSERT INTO shop (id, shop_name, region, currency_code, timezone) VALUES (?, ?, ?, ?, ?)`
  ).run(id, `Bench Shop ${id}`, ['US', 'UK', 'SEA', 'US'][id - 1], ['USD', 'GBP', 'SGD', 'USD'][id - 1], 'UTC');
}

const seed = db.transaction(() => {
  for (let i = 1; i <= ROWS; i += 1) {
    const shopId = shops[i % shops.length];
    const dayOffset = -(i % 30);
    insert.run(
      shopId,
      `BENCH-${String(i).padStart(6, '0')}`,
      statuses[i % statuses.length],
      `buyer-${i % 500}`,
      shopId === 2 ? 'GBP' : shopId === 3 ? 'SGD' : 'USD',
      1000 + (i % 900) * 10,
      1000 + (i % 900) * 10,
      shopId === 2 ? 'UK-LONDON' : shopId === 3 ? 'SEA-SG' : 'US-WEST',
      `-${Math.abs(dayOffset)} day`,
      `-${Math.abs(dayOffset)} day`
    );
  }
});
seed();
console.log(`seeded orders: ${db.prepare('SELECT COUNT(*) AS c FROM platform_order').get().c}`);

// 模拟订单中心三种真实查询：按店铺+状态翻页、关键词搜索、看板按天聚合
const queries = {
  // 订单中心：店铺 + 状态 + 时间倒序翻页（走 idx_order_shop_created）
  listByShopStatus: {
    sql: `SELECT o.id, o.platform_order_id, o.status, o.total_amount_cent, o.created_at, s.shop_name
          FROM platform_order o
          LEFT JOIN shop s ON s.id = o.shop_id
          WHERE o.shop_id = ? AND o.status = ?
          ORDER BY o.created_at DESC
          LIMIT 20`,
    params: [1, 'PAID'],
  },
  // 订单中心：跨店铺按状态 + 关键词搜索（走 idx_order_status）
  searchByKeyword: {
    sql: `SELECT o.id, o.platform_order_id, o.status, o.created_at
          FROM platform_order o
          WHERE o.status = ? AND (o.platform_order_id LIKE ? OR o.buyer_name LIKE ?)
          ORDER BY o.created_at DESC
          LIMIT 20`,
    params: ['SHIPPED', '%BENCH-0001%', '%buyer-1%'],
  },
  // 看板：近 7 天按天聚合 GMV（走 idx_order_created）
  dailyGmv: {
    sql: `SELECT date(created_at) AS stat_date, COUNT(*) AS orders, SUM(base_amount_cent) AS gmv_cent
          FROM platform_order
          WHERE created_at >= datetime('now', '-7 day') AND status NOT IN ('CANCELLED', 'REFUNDED')
          GROUP BY date(created_at)
          ORDER BY stat_date`,
    params: [],
  },
  // 待办：超时未发货计数（status + paid_at 组合条件）
  overdueCount: {
    sql: `SELECT COUNT(*) AS c FROM platform_order
          WHERE status = 'PAID' AND paid_at IS NOT NULL AND paid_at < datetime('now', '-48 hour')`,
    params: [],
  },
};

function timeIt(fn, rounds = 60, warmup = 10) {
  for (let i = 0; i < warmup; i += 1) fn();
  const samples = [];
  for (let i = 0; i < rounds; i += 1) {
    const started = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  return { avg, median, p95: samples[Math.ceil(samples.length * 0.95) - 1] };
}

function measureAll(label) {
  const result = {};
  for (const [name, query] of Object.entries(queries)) {
    const stmt = db.prepare(query.sql);
    const run = () => stmt.all(...query.params);
    const timing = timeIt(run);
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
      .all(...query.params)
      .map((row) => row.detail)
      .join(' | ');
    result[name] = { ...timing, plan };
    console.log(
      `${label} ${name.padEnd(20)} median=${timing.median.toFixed(3)}ms avg=${timing.avg.toFixed(3)}ms p95=${timing.p95.toFixed(3)}ms`
    );
    console.log(`  plan: ${plan}`);
  }
  return result;
}

for (const name of ORDER_INDEXES) db.exec(`DROP INDEX IF EXISTS ${name}`);
db.exec('ANALYZE');
const withoutIndex = measureAll('[无索引]');

db.exec(
  fs
    .readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8')
    .match(/CREATE INDEX[\s\S]*?;/g)
    .join('\n')
);
db.exec('ANALYZE');
const withIndex = measureAll('[有索引]');

const summary = {};
for (const name of Object.keys(queries)) {
  const before = withoutIndex[name].median;
  const after = withIndex[name].median;
  summary[name] = {
    without_index_ms: Number(before.toFixed(3)),
    with_index_ms: Number(after.toFixed(3)),
    speedup: Number((before / after).toFixed(2)),
    without_index_plan: withoutIndex[name].plan,
    with_index_plan: withIndex[name].plan,
  };
}
console.log(`\n=== 汇总（${ROWS} 条订单，中位数，60 次采样）===`);
for (const [name, row] of Object.entries(summary)) {
  console.log(`${name}: ${row.without_index_ms}ms → ${row.with_index_ms}ms（${row.speedup}x）`);
}
console.log(
  JSON.stringify({ rows: ROWS, rounds: 60, measured_at: new Date().toISOString(), summary }, null, 2)
);

db.close();
