import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/response';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * 简易内存限流（固定窗口）。
 * 生产环境可换成 Redis 计数器，这里是为了让 Mock 网关能真实返回 429，
 * 便于前端与后端重试逻辑的联调验证。
 */
export function rateLimit(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader('X-RateLimit-Remaining', String(options.max - 1));
      return next();
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return next(ApiError.tooManyRequests(`请求超过限流阈值，请在 ${retryAfter}s 后重试`));
    }
    res.setHeader('X-RateLimit-Remaining', String(options.max - bucket.count));
    return next();
  };
}

/** 测试用：清空限流桶 */
export function createRateLimiter(options: { windowMs: number; max: number }) {
  return rateLimit(options);
}
