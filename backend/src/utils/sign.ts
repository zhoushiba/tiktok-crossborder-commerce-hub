/**
 * 开放平台签名工具（Mock 服务与被调用的客户端共用同一套实现）。
 *
 * 规则：sign = HMAC-SHA256(app_secret, 排序后的 query 参数串 + 原始 body)
 *   - 参数按 key 字典序升序，跳过空值与 sign 自身；
 *   - timestamp 参与签名，服务端校验 5 分钟窗口，防重放；
 *   - 输出小写十六进制。
 */
import crypto from 'node:crypto';

export type SignParams = Record<string, string | number | undefined | null>;

export function buildCanonicalString(params: SignParams, body = ''): string {
  const keys = Object.keys(params)
    .filter((key) => key !== 'sign')
    .filter((key) => params[key] !== undefined && params[key] !== null && `${params[key]}` !== '')
    .sort();
  const pairs = keys.map((key) => `${key}=${params[key]}`);
  return pairs.join('&') + body;
}

export function hmacSign(secret: string, canonical: string): string {
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function signRequest(secret: string, params: SignParams, body = ''): string {
  return hmacSign(secret, buildCanonicalString(params, body));
}

/** 恒定时间比较，避免签名比对被时序侧信道利用 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isTimestampFresh(timestamp: string | number, windowSeconds = 300, now = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // 支持秒或毫秒时间戳
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  return Math.abs(now - tsMs) <= windowSeconds * 1000;
}
