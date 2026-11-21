import { initDatabase, getDb, closeDb } from './index';

/**
 * 重置数据库：按 db/schema.sql 重建表结构并灌入 db/seed.sql 演示数据。
 * 用法：npm run db:reset
 */
function reset(): void {
  initDatabase({ reset: true });
  const db = getDb();
  const tables = ['sys_user', 'shop', 'product', 'platform_order', 'commission_record', 'settlement', 'audit_log'];
  const summary = tables.map((table) => {
    const row = db.prepare(`SELECT COUNT(1) AS c FROM ${table}`).get() as { c: number };
    return `${table}=${row.c}`;
  });
  // eslint-disable-next-line no-console
  console.log(`[db] 重置完成：${summary.join(', ')}`);
  closeDb();
}

reset();
