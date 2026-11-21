import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../db';

/** 为每个请求分配 requestId，并输出访问日志（含耗时，便于定位性能问题） */
export function requestContext(log = true) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    if (!log) return next();
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const costMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const line = `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${costMs.toFixed(1)}ms rid=${requestId}`;
      if (res.statusCode >= 500) console.error(line);
      else console.log(line);
    });
    return next();
  };
}

/**
 * 操作日志审计：只记录写操作（POST/PUT/PATCH/DELETE），
 * 日志落库失败不影响主流程（审计不能反过来阻断业务）。
 */
export function auditTrail(resource: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
      if (res.statusCode >= 400) return;
      try {
        getDb()
          .prepare(
            `INSERT INTO audit_log (user_id, username, action, resource, resource_id, method, path, ip, detail)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            req.user?.id ?? null,
            req.user?.username ?? 'anonymous',
            `${req.method} ${resource}`,
            resource,
            String((req.body as Record<string, unknown>)?.id ?? req.params?.id ?? ''),
            req.method,
            req.originalUrl,
            req.ip ?? '',
            JSON.stringify({ params: req.params, body: sanitize(req.body) }).slice(0, 2000),
          );
      } catch (err) {
        console.warn('[audit] 写入操作日志失败', err);
      }
    });
    return next();
  };
}

/** 敏感字段脱敏，避免密码进入审计日志 */
function sanitize(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    if (/password|secret|token/i.test(key)) clone[key] = '***';
  }
  return clone;
}
