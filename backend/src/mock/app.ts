import express, { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { signRequest, isTimestampFresh } from '../utils/sign';
import { toUtcString } from '../utils/datetime';
import { createRateLimiter } from '../middlewares/rateLimit';

/**
 * TikTok Shop 开放平台 Mock 网关（本地 8090 端口）。
 *
 * 刻意还原真实平台的四个关键机制，用来演示联调与容错能力：
 * 1. 鉴权：app_key + app_secret 换 access_token（带过期时间）
 * 2. 签名：HMAC-SHA256(app_secret, 排序后的参数拼接 + body)，sign 不参与计算
 * 3. 防重放：timestamp 必须落在 300 秒窗口内
 * 4. 分页：游标 next_page_token，直到返回 null
 */
const SHOP_CURRENCY: Record<number, string> = { 1: 'USD', 2: 'GBP', 3: 'SGD', 4: 'USD' };

const SKU_POOL = [
  { sku: 'TT-BEAUTY-001', title: 'Velvet Matte Lipstick Set', priceCent: 2999 },
  { sku: 'TT-BEAUTY-002', title: 'Hydrating Face Serum 30ml', priceCent: 5999 },
  { sku: 'TT-HOME-001', title: 'Foldable Storage Box', priceCent: 8999 },
  { sku: 'TT-HOME-002', title: 'Ceramic Mug Set (4pcs)', priceCent: 12999 },
  { sku: 'TT-3C-001', title: 'Magnetic Phone Stand', priceCent: 1299 },
  { sku: 'TT-3C-002', title: '65W GaN Fast Charger', priceCent: 2699 },
];

const STATUS_POOL = ['PAID', 'SHIPPED', 'DELIVERED', 'PENDING', 'REFUNDING', 'CANCELLED'];

interface MockOrder {
  order_id: string;
  status: string;
  buyer_name: string;
  currency: string;
  total_amount_cent: number;
  create_time: string;
  paid_time: string | null;
  site_code: string | null;
  items: Array<{ sku: string; title: string; quantity: number; unit_price_cent: number }>;
}

const BUYERS = ['Ava Chen', 'Mia Johnson', 'Liam Smith', 'Noah Brown', 'Emma Wilson', 'Kai Tan', 'Sofia Rossi', 'Lucas Meyer'];
const SITES: Record<number, string> = { 1: 'US-WEST', 2: 'UK-LONDON', 3: 'SEA-SG', 4: 'US-EAST' };

/**
 * 为某个店铺生成确定性的订单集合（同一店铺每次生成结果一致，方便测试与演示）。
 * 第 2 页刻意混入 1 条第 1 页出现过的订单，用来验证「幂等去重」。
 */
export function buildMockOrders(shopId: number, total = 9): MockOrder[] {
  const currency = SHOP_CURRENCY[shopId] ?? 'USD';
  const orders: MockOrder[] = [];
  for (let i = 0; i < total; i += 1) {
    const first = SKU_POOL[i % SKU_POOL.length];
    const second = SKU_POOL[(i + 2) % SKU_POOL.length];
    const quantity = (i % 2) + 1;
    const items =
      i % 3 === 0
        ? [{ sku: first.sku, title: first.title, quantity, unit_price_cent: first.priceCent }]
        : [
            { sku: first.sku, title: first.title, quantity, unit_price_cent: first.priceCent },
            { sku: second.sku, title: second.title, quantity: 1, unit_price_cent: second.priceCent },
          ];
    const totalAmountCent = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cent, 0);
    const createdAt = new Date(Date.now() - (i + 1) * 86_400_000);
    const status = STATUS_POOL[i % STATUS_POOL.length];
    orders.push({
      order_id: `TT-${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(shopId).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`,
      status,
      buyer_name: BUYERS[i % BUYERS.length],
      currency,
      total_amount_cent: totalAmountCent,
      create_time: toUtcString(createdAt),
      paid_time: ['PAID', 'SHIPPED', 'DELIVERED', 'REFUNDING'].includes(status) ? toUtcString(createdAt) : null,
      site_code: SITES[shopId] ?? null,
      items,
    });
  }
  return orders;
}

function verifySignedQuery(req: Request, res: Response): boolean {
  const params = Object.fromEntries(
    Object.entries(req.query as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
  );
  const { sign, ...rest } = params;
  if (!sign) {
    res.status(401).json({ code: 40100, message: 'missing sign', data: null });
    return false;
  }
  if (!isTimestampFresh(rest.timestamp)) {
    res.status(401).json({ code: 40101, message: 'timestamp expired', data: null });
    return false;
  }
  const expected = signRequest(config.tiktok.appSecret, rest, '');
  if (expected !== sign) {
    res.status(401).json({ code: 40102, message: 'invalid sign', data: null });
    return false;
  }
  return true;
}

/** 创建一个独立的 Mock 网关 Express 实例（测试可直接 supertest 挂载） */
export function createMockApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.disable('x-powered-by');

  const limitDemo = createRateLimiter({ windowMs: 60_000, max: 3 });

  app.get('/api/v2/health', (_req, res) => {
    res.json({ code: 0, message: 'success', data: { status: 'UP', platform: 'TIKTOK_SHOP_MOCK' } });
  });

  /** 鉴权：换取 access_token */
  app.post('/api/v2/token/get', (req, res) => {
    const { app_key: appKey, app_secret: appSecret } = req.body ?? {};
    if (appKey !== config.tiktok.appKey || appSecret !== config.tiktok.appSecret) {
      res.status(401).json({ code: 40103, message: 'app_key or app_secret mismatch', data: null });
      return;
    }
    res.json({
      code: 0,
      message: 'success',
      data: {
        access_token: `act.mock.${Buffer.from(`${appKey}:${Date.now()}`).toString('base64url').slice(0, 24)}`,
        access_token_expire_in: 7200,
        refresh_token: 'rft.mock.demo',
      },
    });
  });

  /**
   * 订单检索：游标分页 + 签名校验 + 时间窗口防重放。
   * Mock 把每页条数强制限制为 4 条，用来演示「必须循环拉完游标」的真实场景。
   */
  app.get('/api/v2/orders/search', (req, res) => {
    if (!verifySignedQuery(req, res)) return;
    const shopId = Number(req.query.shop_id ?? 1);
    const requestedPageSize = Number(req.query.page_size ?? 20);
    const pageSize = Math.min(Math.max(requestedPageSize, 1), 4);
    const status = req.query.status ? String(req.query.status) : undefined;

    let dataset = buildMockOrders(shopId);
    if (status) {
      dataset = dataset.filter((order) => order.status === status);
    }
    const offset = req.query.next_page_token ? Number(Buffer.from(String(req.query.next_page_token), 'base64url').toString('utf8')) : 0;
    const slice = dataset.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;

    // 第 2 页重复返回第 1 页的最后一条订单：验证幂等键 shop_id + platform_order_id
    const orders = offset > 0 && slice.length > 0 && dataset[0] ? [dataset[0], ...slice] : slice;

    res.json({
      code: 0,
      message: 'success',
      data: {
        orders,
        total_count: dataset.length,
        next_page_token: nextOffset < dataset.length ? Buffer.from(String(nextOffset)).toString('base64url') : null,
      },
    });
  });

  app.get('/api/v2/orders/detail', (req, res) => {
    if (!verifySignedQuery(req, res)) return;
    const shopId = Number(req.query.shop_id ?? 1);
    const orderId = String(req.query.order_id ?? '');
    const order = buildMockOrders(shopId).find((item) => item.order_id === orderId);
    if (!order) {
      res.status(404).json({ code: 40400, message: 'order not found', data: null });
      return;
    }
    res.json({ code: 0, message: 'success', data: order });
  });

  app.post('/api/v2/products/sync', (req, res) => {
    const products = Array.isArray(req.body?.products) ? req.body.products : [];
    res.json({ code: 0, message: 'success', data: { received: products.length, synced: products.length } });
  });

  /** 限流演示端点：1 分钟内第 4 次请求返回 429 */
  app.get('/api/v2/limit-demo', limitDemo, (_req, res) => {
    res.json({ code: 0, message: 'success', data: { ok: true } });
  });

  app.use((_req, res) => {
    res.status(404).json({ code: 40400, message: 'mock endpoint not found', data: null });
  });

  /**
   * 统一错误处理：限流中间件通过 next(ApiError) 抛出，若不在此处兜底
   * Express 会返回 HTML 500，联调时看不到真实的状态码。
   */
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { httpStatus?: number }).httpStatus ?? 500;
    const code = (err as { code?: number }).code ?? 50000;
    const message = err instanceof Error ? err.message : 'mock gateway error';
    res.status(status).json({ code, message, data: null });
  });

  return app;
}
