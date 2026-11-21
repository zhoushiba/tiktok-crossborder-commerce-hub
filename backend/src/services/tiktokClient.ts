import { config } from '../config';
import { shopRepo } from '../repositories/shopRepo';
import { signRequest, isTimestampFresh } from '../utils/sign';
import { ApiError } from '../utils/response';

export interface PlatformOrderItem {
  sku: string;
  title: string;
  quantity: number;
  unit_price_cent: number;
}

export interface PlatformOrderDTO {
  order_id: string;
  status: string;
  buyer_name: string;
  currency: string;
  total_amount_cent: number;
  create_time: string;
  paid_time?: string | null;
  site_code?: string | null;
  items: PlatformOrderItem[];
}

export interface OrderSearchParams {
  status?: string;
  pageSize?: number;
  createTimeFrom?: string;
  createTimeTo?: string;
}

export interface OrderSearchResult {
  orders: PlatformOrderDTO[];
  nextPageToken: string | null;
  fetchedPages: number;
}

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

/** 进程内 token 缓存：同一店铺 30 分钟内复用，避免每次同步都换 token */
const tokenCache = new Map<number, TokenCacheEntry>();

async function requestJson<T>(url: string, init: RequestInit, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.tiktok.timeoutMs);
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      const text = await response.text();
      if (response.status === 429 && attempt < retries) {
        // 平台限流：指数退避后重试
        await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
        continue;
      }
      if (!response.ok) {
        throw ApiError.badRequest(`TikTok 开放平台返回 ${response.status}: ${text.slice(0, 200)}`);
      }
      return JSON.parse(text) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof ApiError) throw error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }
  }
  throw ApiError.badRequest(`调用 TikTok 开放平台失败：${(lastError as Error).message}`);
}

/**
 * TikTok Shop 开放平台客户端（对接本仓库自带的 Mock 网关 8090，签名规则与真实平台一致）：
 * - 鉴权：app_key + app_secret 换 access_token
 * - 签名：HMAC-SHA256(app_secret, 排序后的 key=value 拼接 + body)
 * - 防重放：timestamp 必须在 300 秒窗口内
 * - 分页：游标 next_page_token，直到为空
 */
export const tiktokClient = {
  async getAccessToken(shopId: number, force = false): Promise<string> {
    const cached = tokenCache.get(shopId);
    if (cached && cached.expiresAt > Date.now() && !force) {
      return cached.token;
    }
    const shop = shopRepo.findById(shopId);
    if (!shop) {
      throw ApiError.notFound(`店铺 ${shopId} 不存在`);
    }
    const body = JSON.stringify({ app_key: config.tiktok.appKey, app_secret: config.tiktok.appSecret, grant_type: 'authorized_code' });
    const result = await requestJson<{ code: number; message: string; data?: { access_token: string; access_token_expire_in: number } }>(
      `${config.tiktok.baseUrl}/api/v2/token/get`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    );
    if (result.code !== 0 || !result.data) {
      throw ApiError.badRequest(`获取 access_token 失败：${result.message}`);
    }
    tokenCache.set(shopId, {
      token: result.data.access_token,
      expiresAt: Date.now() + Math.max(60, result.data.access_token_expire_in - 60) * 1000,
    });
    shopRepo.authorize(shopId, result.data.access_token, new Date(Date.now() + result.data.access_token_expire_in * 1000).toISOString().slice(0, 19).replace('T', ' '));
    return result.data.access_token;
  },

  async searchOrders(shopId: number, params: OrderSearchParams = {}): Promise<OrderSearchResult> {
    const token = await this.getAccessToken(shopId);
    const orders: PlatformOrderDTO[] = [];
    let pageToken: string | null = null;
    let fetchedPages = 0;
    do {
      fetchedPages += 1;
      const query: Record<string, string | number> = {
        app_key: config.tiktok.appKey,
        access_token: token,
        timestamp: Math.floor(Date.now() / 1000),
        page_size: params.pageSize ?? config.tiktok.pageSize,
        shop_id: shopId,
      };
      if (pageToken) query.next_page_token = pageToken;
      if (params.status) query.status = params.status;
      if (params.createTimeFrom) query.create_time_from = params.createTimeFrom;
      if (params.createTimeTo) query.create_time_to = params.createTimeTo;
      const sign = signRequest(config.tiktok.appSecret, query, '');
      const search = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), sign });
      const result = await requestJson<{
        code: number;
        message: string;
        data?: { orders: PlatformOrderDTO[]; next_page_token: string | null };
      }>(`${config.tiktok.baseUrl}/api/v2/orders/search?${search.toString()}`, { method: 'GET' });
      if (result.code !== 0 || !result.data) {
        throw ApiError.badRequest(`拉取订单失败：${result.message}`);
      }
      orders.push(...result.data.orders);
      pageToken = result.data.next_page_token ?? null;
      if (fetchedPages >= config.tiktok.maxPages) break;
    } while (pageToken);
    return { orders, nextPageToken: pageToken, fetchedPages };
  },

  /** 校验 Mock 网关回调签名（用于 /api/mock/callback 演示） */
  verifySignature(params: Record<string, string>, body = ''): boolean {
    const { sign, ...rest } = params;
    if (!sign) return false;
    if (!isTimestampFresh(rest.timestamp)) return false;
    return signRequest(config.tiktok.appSecret, rest, body) === sign;
  },
};
