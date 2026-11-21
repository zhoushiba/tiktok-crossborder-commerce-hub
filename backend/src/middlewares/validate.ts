import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/response';

/** 请求体校验：zod 校验通过后用解析结果覆盖 req.body（完成类型收敛与默认值填充） */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(ApiError.badRequest('请求参数校验失败', formatZodError(result.error)));
    }
    req.body = result.data;
    return next();
  };
}

/** query 校验：结果挂到 req.query 上（express 的 query 是只读 getter，这里用 res.locals 传递） */
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      return next(ApiError.badRequest('查询参数校验失败', formatZodError(result.error)));
    }
    res.locals.query = result.data;
    return next();
  };
}

export function formatZodError(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
