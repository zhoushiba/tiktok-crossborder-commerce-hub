import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildCanonicalString, hmacSign, signRequest, isTimestampFresh } from '../src/utils/sign';
import { createMockApp } from '../src/mock/app';
import { config } from '../src/config';

describe('开放平台签名与 Mock 网关', () => {
  it('签名串按 key 升序拼接并剔除 sign 与空值', () => {
    const canonical = buildCanonicalString({ b: 2, a: 1, sign: 'xxx', empty: '' });
    expect(canonical).toBe('a=1&b=2');
    expect(buildCanonicalString({ a: 1 }, '{"k":"v"}')).toBe('a=1{"k":"v"}');
  });

  it('HMAC-SHA256 结果稳定且对 body 敏感', () => {
    const first = hmacSign('secret', 'a=1&b=2');
    const second = hmacSign('secret', 'a=1&b=2');
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
    expect(hmacSign('secret', 'a=1&b=2{}')).not.toBe(first);
    expect(signRequest('secret', { a: 1, b: 2 }, '')).toBe(first);
  });

  it('时间戳新鲜度校验（300 秒窗口）', () => {
    expect(isTimestampFresh(Math.floor(Date.now() / 1000))).toBe(true);
    expect(isTimestampFresh(Date.now())).toBe(true);
    expect(isTimestampFresh(Math.floor(Date.now() / 1000) - 600)).toBe(false);
    expect(isTimestampFresh('not-a-number')).toBe(false);
    expect(isTimestampFresh(undefined)).toBe(false);
  });

  it('Mock 网关：错误的 app_secret 拿不到 token', async () => {
    const app = createMockApp();
    const response = await request(app).post('/api/v2/token/get').send({
      app_key: config.tiktok.appKey,
      app_secret: 'wrong-secret',
    });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe(40103);
  });

  it('Mock 网关：缺少签名或签名错误返回 401', async () => {
    const app = createMockApp();
    const noSign = await request(app).get('/api/v2/orders/search?shop_id=1&timestamp=' + Math.floor(Date.now() / 1000));
    expect(noSign.status).toBe(401);
    expect(noSign.body.code).toBe(40100);

    const badSign = await request(app).get(
      `/api/v2/orders/search?shop_id=1&timestamp=${Math.floor(Date.now() / 1000)}&sign=deadbeef`,
    );
    expect(badSign.status).toBe(401);
    expect(badSign.body.code).toBe(40102);
  });

  it('Mock 网关：过期时间戳被判定为重放', async () => {
    const app = createMockApp();
    const params: Record<string, string | number> = { shop_id: 1, timestamp: Math.floor(Date.now() / 1000) - 900 };
    const sign = signRequest(config.tiktok.appSecret, params, '');
    const response = await request(app).get(
      `/api/v2/orders/search?shop_id=1&timestamp=${params.timestamp}&sign=${sign}`,
    );
    expect(response.status).toBe(401);
    expect(response.body.code).toBe(40101);
  });

  it('Mock 网关：限流窗口内第 4 次请求返回 429', async () => {
    const app = createMockApp();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await request(app).get('/api/v2/limit-demo');
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });
});
