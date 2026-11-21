import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';
import { ApiError } from '../utils/response';

export interface AuthUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'OPERATOR' | 'HOST' | 'AGENCY' | string;
  realName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** 解析 Bearer Token，失败返回 401（不区分"没带"和"过期"，避免信息泄露） */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return next(ApiError.unauthorized());
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      realName: payload.realName,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** 角色校验：ADMIN 拥有所有权限 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(ApiError.unauthorized());
    if (user.role === 'ADMIN' || roles.includes(user.role)) return next();
    return next(ApiError.forbidden(`需要 ${roles.join('/')} 角色`));
  };
}
