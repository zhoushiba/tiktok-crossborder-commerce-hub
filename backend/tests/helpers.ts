import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import { initDatabase, closeDb } from '../src/db';
import { createApp } from '../src/app';
import { createMockApp } from '../src/mock/app';
import { config } from '../src/config';

export interface LoginResult {
  token: string;
  user: { id: number; username: string; role: string; realName: string };
}

export interface TestContext {
  app: Express;
  mock: Server;
  login: (username: string, password: string) => Promise<LoginResult>;
  admin: LoginResult;
  operator: LoginResult;
  /** 带 token 的 supertest 快捷方式 */
  as: (token: string) => ReturnType<typeof clientWithToken>;
}

function clientWithToken(app: Express, token: string) {
  const withToken = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  return {
    get: (url: string) => withToken(request(app).get(url)),
    post: (url: string) => withToken(request(app).post(url)),
    patch: (url: string) => withToken(request(app).patch(url)),
    del: (url: string) => withToken(request(app).delete(url)),
  };
}

/**
 * 测试脚手架：
 * - 每个测试文件使用独立的内存 SQLite（file=:memory:），互不污染
 * - 启动一个真实监听端口的 Mock 网关，并把 tiktokClient 的 baseUrl 指过去，
 *   这样订单同步走的是真实的 HTTP + 签名 + 游标分页链路
 */
export async function boot(): Promise<TestContext> {
  initDatabase({ file: ':memory:' });

  const mockServer = createMockApp().listen(0);
  await new Promise<void>((resolve) => mockServer.once('listening', () => resolve()));
  const { port } = mockServer.address() as AddressInfo;
  config.tiktok.baseUrl = `http://127.0.0.1:${port}`;

  const app = createApp();

  const login = async (username: string, password: string): Promise<LoginResult> => {
    const response = await request(app).post('/api/auth/login').send({ username, password });
    if (response.status !== 200 || response.body.code !== 0) {
      throw new Error(`登录失败 ${username}: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body.data as LoginResult;
  };

  const admin = await login('admin', 'Admin@123');
  const operator = await login('operator', 'Operator@123');

  return {
    app,
    mock: mockServer,
    login,
    admin,
    operator,
    as: (token: string) => clientWithToken(app, token),
  };
}

export async function shutdown(ctx: TestContext): Promise<void> {
  await new Promise<void>((resolve) => ctx.mock.close(() => resolve()));
  closeDb();
}
