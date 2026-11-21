import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, type TestContext } from './helpers';

describe('数据看板与实训管理', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await boot();
  });

  afterAll(async () => {
    await shutdown(ctx);
  });

  it('总览看板返回 KPI、趋势、站点占比与 Top 商品', async () => {
    const response = await ctx.as(ctx.operator.token).get('/api/dashboard/overview?days=7');
    expect(response.status).toBe(200);
    const data = response.body.data;

    expect(data.kpi.gmv_yuan).toBeGreaterThan(0);
    expect(data.kpi.order_count).toBeGreaterThan(0);
    expect(data.kpi.aov_yuan).toBeGreaterThan(0);
    expect(data.trend).toHaveLength(7);

    const shareSum = data.siteShare.reduce((sum: number, item: { ratio: number }) => sum + item.ratio, 0);
    expect(Math.round(shareSum)).toBeGreaterThanOrEqual(99);
    expect(Math.round(shareSum)).toBeLessThanOrEqual(101);

    expect(data.topProducts.length).toBeGreaterThan(0);
    expect(data.topProducts.length).toBeLessThanOrEqual(5);
    expect(data.todo.low_stock).toBeGreaterThan(0);
  });

  it('待办与直播罗盘可查询', async () => {
    const todo = await ctx.as(ctx.operator.token).get('/api/dashboard/todo');
    expect(todo.body.data.inventoryAlerts.length).toBeGreaterThan(0);
    expect(typeof todo.body.data.pending_settlement).toBe('number');

    const live = await ctx.as(ctx.operator.token).get('/api/dashboard/live');
    expect(live.status).toBe(200);
    expect(Array.isArray(live.body.data.sessions)).toBe(true);
  });

  it('直播场次状态机与复盘', async () => {
    const created = await ctx.as(ctx.operator.token).post('/api/live-sessions').send({
      shopId: 1,
      title: '黑五专场直播',
      hostName: 'Ava',
      scheduledAt: '2026-11-28 20:00:00',
      durationMin: 120,
      gmvTargetYuan: 5000,
    });
    expect(created.status).toBe(201);
    const sessionId = created.body.data.id as number;
    expect(created.body.data.status).toBe('PLANNED');

    const living = await ctx.as(ctx.operator.token).post(`/api/live-sessions/${sessionId}/status`).send({ status: 'LIVE' });
    expect(living.body.data.status).toBe('LIVE');

    const metric = await ctx.as(ctx.operator.token)
      .post(`/api/live-sessions/${sessionId}/metrics`)
      .send({ onlineCount: 420, gmvYuan: 1800, orders: 26 });
    expect(metric.status).toBe(200);

    const ended = await ctx.as(ctx.operator.token)
      .post(`/api/live-sessions/${sessionId}/status`)
      .send({ status: 'ENDED', viewers: 5200, peakOnline: 860, ordersCount: 42 });
    expect(ended.body.data.status).toBe('ENDED');
    expect(ended.body.data.viewers).toBe(5200);

    const reviewed = await ctx.as(ctx.operator.token)
      .post(`/api/live-sessions/${sessionId}/review`)
      .send({ note: '节奏偏慢，下轮提前 10 分钟上福利款' });
    expect(reviewed.body.data.status).toBe('REVIEWED');
    expect(reviewed.body.data.review_note).toContain('福利款');

    const illegal = await ctx.as(ctx.operator.token)
      .post(`/api/live-sessions/${sessionId}/status`)
      .send({ status: 'LIVE' });
    expect(illegal.status).toBe(409);
  });

  it('实训：学员/任务/成绩录入与通过率统计', async () => {
    const students = await ctx.as(ctx.operator.token).get('/api/training/students');
    expect(students.body.data.length).toBeGreaterThanOrEqual(6);

    const tasks = await ctx.as(ctx.operator.token).get('/api/training/tasks');
    expect(tasks.body.data.length).toBeGreaterThanOrEqual(4);

    const graded = await ctx.as(ctx.operator.token)
      .post('/api/training/scores')
      .send({ studentId: 1, taskId: 1, score: 92, feedback: '链路清晰，索引讲解到位' });
    expect(graded.status).toBe(200);
    expect(graded.body.data.score).toBe(92);

    const tooHigh = await ctx.as(ctx.operator.token)
      .post('/api/training/scores')
      .send({ studentId: 1, taskId: 1, score: 120 });
    expect(tooHigh.status).toBe(400);

    const overview = await ctx.as(ctx.operator.token).get('/api/training/overview');
    expect(overview.body.data.statistics.student_count).toBeGreaterThanOrEqual(6);
    expect(typeof overview.body.data.passRate).toBe('number');
  });

  it('操作日志统计（管理员）与普通角色权限隔离', async () => {
    await ctx.as(ctx.operator.token).patch('/api/inventory/adjust').send({
      productId: 2,
      shopId: 1,
      availableQty: 99,
    });

    const stats = await ctx.as(ctx.admin.token).get('/api/dashboard/audit-statistics');
    expect(stats.status).toBe(200);
    expect(stats.body.data.total).toBeGreaterThan(0);

    const hostLogin = await ctx.login('host', 'Host@123');
    const forbidden = await ctx.as(hostLogin.token).get('/api/dashboard/audit-logs');
    expect(forbidden.status).toBe(403);
  });
});
