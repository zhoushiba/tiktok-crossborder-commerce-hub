import { Router } from 'express';
import { getDb } from '../db';
import { config } from '../config';
import { sendOk } from '../utils/response';
import { authenticate, requireRole } from '../middlewares/auth';
import { tiktokClient } from '../services/tiktokClient';

export const systemRouter = Router();

/** 健康检查（无需登录，供容器探针与冒烟脚本使用） */
systemRouter.get('/health', (_req, res) => {
  const row = getDb().prepare('SELECT COUNT(1) AS c FROM shop').get() as { c: number };
  sendOk(res, {
    status: 'UP',
    env: config.env,
    database: 'sqlite',
    shopCount: row.c,
    mockGateway: config.tiktok.baseUrl,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

/**
 * @openapi
 * /api/system/config:
 *   get:
 *     tags: [系统]
 *     summary: 系统配置项（只读，管理员可见全部）
 *     responses:
 *       200: { description: 配置键值 }
 */
systemRouter.get('/config', authenticate, requireRole('ADMIN', 'OPERATOR'), (_req, res) => {
  const rows = getDb().prepare('SELECT config_key, config_value, description, updated_at FROM sys_config ORDER BY config_key').all();
  sendOk(res, rows);
});

/** 校验 TikTok 回调签名，演示 HMAC + 时间戳防重放（面试可讲点） */
systemRouter.post('/webhook/verify', (req, res) => {
  const params = { ...(req.query as Record<string, string>), ...(req.body?.params ?? {}) };
  const body = typeof req.body?.body === 'string' ? req.body.body : JSON.stringify(req.body?.body ?? {});
  sendOk(res, { valid: tiktokClient.verifySignature(params, body) });
});
