import { describe, it, expect } from 'vitest';
import { config } from '../src/config';
import { initDatabase, closeDb, getDb } from '../src/db';

describe('环境自检', () => {
  it('配置可加载且 schema 文件存在', () => {
    expect(config.tiktok.appKey).toBeTruthy();
    initDatabase({ file: ':memory:' });
    const row = getDb().prepare('SELECT COUNT(1) AS c FROM sys_user').get() as { c: number };
    expect(row.c).toBeGreaterThan(0);
    closeDb();
  });
});
