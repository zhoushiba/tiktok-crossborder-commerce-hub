/**
 * 统一响应体与业务错误。
 *
 * 成功：{ code: 0, message: 'success', data: ... , requestId }
 * 失败：{ code: 4xxxx, message: '...', details?: ..., requestId }
 * HTTP 状态码同步设置，便于监控与网关识别。
 */
import type { Response } from 'express';

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data?: T;
  /** 失败时的结构化明细（例如 zod 校验错误列表） */
  details?: unknown;
  requestId?: string;
  timestamp: string;
}

export class ApiError extends Error {
  readonly httpStatus: number;
  readonly code: number;
  readonly details?: unknown;

  constructor(httpStatus: number, code: number, message: string, details?: unknown) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 40000, message, details);
  }

  static unauthorized(message = '未登录或登录已过期') {
    return new ApiError(401, 40100, message);
  }

  static forbidden(message = '无权限执行该操作') {
    return new ApiError(403, 40300, message);
  }

  static notFound(message = '资源不存在') {
    return new ApiError(404, 40400, message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 40900, message, details);
  }

  static tooManyRequests(message = '请求过于频繁，请稍后再试') {
    return new ApiError(429, 42900, message);
  }

  static internal(message = '服务器内部错误', details?: unknown) {
    return new ApiError(500, 50000, message, details);
  }
}

function requestId(res: Response): string | undefined {
  return (res.locals.requestId as string) || undefined;
}

export function sendOk<T>(res: Response, data: T, message = 'success', httpStatus = 200) {
  const body: ApiEnvelope<T> = {
    code: 0,
    message,
    data,
    requestId: requestId(res),
    timestamp: new Date().toISOString(),
  };
  return res.status(httpStatus).json(body);
}

export function sendCreated<T>(res: Response, data: T, message = 'created') {
  return sendOk(res, data, message, 201);
}

export function sendError(res: Response, error: ApiError) {
  const body: ApiEnvelope<unknown> = {
    code: error.code,
    message: error.message,
    details: error.details,
    requestId: requestId(res),
    timestamp: new Date().toISOString(),
  };
  return res.status(error.httpStatus).json(body);
}

/** 分页响应包装 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
}

export function toPage<T>(list: T[], total: number, page: number, pageSize: number): PageResult<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    list,
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
  };
}
