import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { boot, shutdown, type TestContext } from './helpers';

describe('认证与权限（JWT + RBAC）', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await boot();
  });

  afterAll(async () => {
    await shutdown(ctx);
  });

  it('管理员登录返回 JWT 与角色信息', async () => {
    const response = await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'Admin@123' });
    expect(response.status).toBe(200);
    expect(response.body.code).toBe(0);
    expect(response.body.data.token.split('.')).toHaveLength(3);
    expect(response.body.data.user.role).toBe('ADMIN');
    expect(response.body.data.expiresIn).toBeTruthy();
  });

  it('密码错误返回 401 且不泄露账号是否存在', async () => {
    const response = await request(ctx.app).post('/api/auth/login').send({ username: 'admin', password: 'wrong-pass' });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe(40100);
    expect(response.body.message).toContain('用户名或密码错误');
  });

  it('未携带 token 访问业务接口被拒绝', async () => {
    const response = await request(ctx.app).get('/api/products');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe(40100);
  });

  it('注册机构代理账号后可登录，但不允许注册管理员', async () => {
    const created = await request(ctx.app)
      .post('/api/auth/register')
      .send({ username: 'agency_demo', password: 'Agency@123', realName: '杭州某 MCN', role: 'AGENCY' });
    expect(created.status).toBe(201);
    expect(created.body.data.user.role).toBe('AGENCY');

    const login = await request(ctx.app).post('/api/auth/login').send({ username: 'agency_demo', password: 'Agency@123' });
    expect(login.body.code).toBe(0);

    const forbidden = await request(ctx.app)
      .post('/api/auth/register')
      .send({ username: 'hacker', password: 'Hacker@123', realName: '越权', role: 'ADMIN' });
    expect(forbidden.status).toBe(400);
    expect(forbidden.body.code).toBe(40000);
  });

  it('运营角色不能新增用户（RBAC 生效）', async () => {
    const response = await ctx.as(ctx.operator.token).post('/api/auth/users').send({
      username: 'another_op',
      password: 'Another@123',
      realName: '新运营',
      role: 'OPERATOR',
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe(40300);
  });

  it('写操作会写入审计日志', async () => {
    await ctx.as(ctx.operator.token).patch('/api/inventory/adjust').send({
      productId: 1,
      shopId: 1,
      availableQty: 66,
      safetyQty: 20,
    });

    const logs = await ctx.as(ctx.admin.token).get('/api/dashboard/audit-logs?resource=inventory');
    expect(logs.status).toBe(200);
    expect(logs.body.data.length).toBeGreaterThan(0);
    expect(logs.body.data[0].action).toContain('PATCH');
    expect(logs.body.data[0].path).toContain('/api/inventory/adjust');
  });
});
