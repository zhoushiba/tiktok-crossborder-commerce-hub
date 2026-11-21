import { getDb } from '../db';
import type { SysUser } from '../types';

export const userRepo = {
  findByUsername(username: string): SysUser | undefined {
    return getDb().prepare('SELECT * FROM sys_user WHERE username = ?').get(username) as SysUser | undefined;
  },

  findById(id: number): SysUser | undefined {
    return getDb().prepare('SELECT * FROM sys_user WHERE id = ?').get(id) as SysUser | undefined;
  },

  listSafe() {
    return getDb()
      .prepare('SELECT id, username, real_name, role, email, status, created_at FROM sys_user ORDER BY id')
      .all();
  },

  create(input: { username: string; passwordHash: string; realName: string; role: string; email?: string }) {
    const info = getDb()
      .prepare(
        'INSERT INTO sys_user (username, password_hash, real_name, role, email) VALUES (?, ?, ?, ?, ?)',
      )
      .run(input.username, input.passwordHash, input.realName, input.role, input.email ?? null);
    return Number(info.lastInsertRowid);
  },
};
