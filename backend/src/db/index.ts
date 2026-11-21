import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';

export type Db = Database.Database;

let db: Db | null = null;

function readSql(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export interface InitOptions {
  file?: string;
  /** 强制重建（删除已有文件后重新建表灌种子） */
  reset?: boolean;
  /** 只建表不灌种子，测试里偶尔需要空库 */
  skipSeed?: boolean;
}

/** 建表 + 灌种子数据（幂等：已有数据则跳过） */
export function initDatabase(options: InitOptions = {}): Db {
  const file = options.file ?? config.dbFile;

  if (file !== ':memory:') {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (options.reset && fs.existsSync(file)) fs.unlinkSync(file);
  }

  const instance = new Database(file);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  instance.exec(readSql(config.schemaFile));

  const seeded = instance.prepare('SELECT COUNT(1) AS c FROM sys_user').get() as { c: number };
  if (!options.skipSeed && seeded.c === 0) {
    const seedSql = readSql(config.seedFile);
    const run = instance.transaction(() => {
      instance.exec(seedSql);
    });
    run();
  }

  db = instance;
  return instance;
}

export function getDb(): Db {
  if (!db) db = initDatabase();
  return db;
}

/** 测试专用：注入一个独立数据库实例 */
export function setDb(instance: Db) {
  db = instance;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** 简易事务包装：嵌套调用时重用外层事务 */
export function withTransaction<T>(fn: () => T): T {
  const instance = getDb();
  if (instance.inTransaction) return fn();
  const tx = instance.transaction(fn);
  return tx();
}
