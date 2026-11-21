import bcrypt from 'bcryptjs';
import { userRepo } from '../repositories/userRepo';
import { ApiError } from '../utils/response';
import { signToken } from '../utils/jwt';
import { config } from '../config';
import type { AuthUser } from '../middlewares/auth';

export type RegisterRole = 'ADMIN' | 'OPERATOR' | 'HOST' | 'AGENCY';

export const authService = {
  /**
   * 注册：默认只允许注册 OPERATOR / HOST / AGENCY，管理员账号由种子数据或管理员后台创建，
   * 防止公开注册接口被用来提权。
   */
  register(input: { username: string; password: string; realName: string; role: RegisterRole; email?: string }) {
    if (input.role === 'ADMIN') {
      throw ApiError.forbidden('注册接口不允许创建管理员账号，请联系管理员分配');
    }
    if (userRepo.findByUsername(input.username)) {
      throw ApiError.conflict(`用户名 ${input.username} 已存在`);
    }
    const passwordHash = bcrypt.hashSync(input.password, 10);
    const id = userRepo.create({
      username: input.username,
      passwordHash,
      realName: input.realName,
      role: input.role,
      email: input.email,
    });
    return this.issueToken(id);
  },

  login(input: { username: string; password: string }) {
    const user = userRepo.findByUsername(input.username);
    if (!user) {
      throw ApiError.unauthorized('用户名或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      throw ApiError.forbidden('账号已被禁用');
    }
    if (!bcrypt.compareSync(input.password, user.password_hash)) {
      throw ApiError.unauthorized('用户名或密码错误');
    }
    return this.issueToken(user.id);
  },

  issueToken(userId: number) {
    const user = userRepo.findById(userId);
    if (!user) {
      throw ApiError.unauthorized('用户不存在');
    }
    const authUser: AuthUser = { id: user.id, username: user.username, realName: user.real_name, role: user.role };
    const token = signToken({ sub: user.id, username: user.username, role: user.role, realName: user.real_name });
    return {
      token,
      tokenType: 'Bearer',
      expiresIn: config.jwtExpiresIn,
      user: authUser,
    };
  },

  profile(userId: number) {
    const user = userRepo.findById(userId);
    if (!user) {
      throw ApiError.notFound('用户不存在');
    }
    return { id: user.id, username: user.username, realName: user.real_name, role: user.role, email: user.email };
  },

  listUsers() {
    return userRepo.listSafe();
  },

  createUser(input: { username: string; password: string; realName: string; role: RegisterRole; email?: string }) {
    if (userRepo.findByUsername(input.username)) {
      throw ApiError.conflict(`用户名 ${input.username} 已存在`);
    }
    const id = userRepo.create({
      username: input.username,
      passwordHash: bcrypt.hashSync(input.password, 10),
      realName: input.realName,
      role: input.role,
      email: input.email,
    });
    return { id };
  },
};
