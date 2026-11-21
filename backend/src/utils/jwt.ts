import jwt from 'jsonwebtoken';
import { config } from '../config';
import { ApiError } from './response';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  realName: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as unknown as JwtPayload;
    if (!decoded || typeof decoded.sub !== 'number') {
      throw ApiError.unauthorized('令牌内容非法');
    }
    return decoded;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized('登录已过期，请重新登录');
  }
}
