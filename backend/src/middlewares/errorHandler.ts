import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError, sendError } from '../utils/response';
import { formatZodError } from './validate';

/** 统一异常出口：业务异常转响应，未知异常记录堆栈但不外泄细节 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return sendError(res, err);
  }
  if (err instanceof ZodError) {
    return sendError(res, ApiError.badRequest('请求参数校验失败', formatZodError(err)));
  }
  // better-sqlite3 的唯一键冲突统一映射为 409，避免上层到处写 try/catch
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('UNIQUE constraint failed')) {
    return sendError(res, ApiError.conflict('数据已存在，违反唯一约束', { detail: message }));
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return sendError(res, ApiError.badRequest('关联数据不存在或仍被引用'));
  }
  if (message.includes('CHECK constraint failed')) {
    return sendError(res, ApiError.badRequest('字段取值不合法', { detail: message }));
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return sendError(res, ApiError.internal('服务器内部错误'));
}

/** 404 兜底 */
export function notFoundHandler(req: Request, res: Response) {
  return sendError(res, ApiError.notFound(`接口不存在: ${req.method} ${req.originalUrl}`));
}
