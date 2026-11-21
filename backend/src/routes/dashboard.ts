import { Router } from 'express';
import { dashboardService } from '../services/dashboardService';
import { auditService } from '../services/trainingService';
import { sendOk } from '../utils/response';
import { requireRole } from '../middlewares/auth';

export const dashboardRouter = Router();

/**
 * @openapi
 * /api/dashboard/overview:
 *   get:
 *     tags: [数据看板]
 *     summary: 总览看板（KPI/趋势/站点占比/Top 商品/待办/直播 ROI）
 *     parameters:
 *       - { in: query, name: days, schema: { type: integer, default: 14 } }
 *     responses:
 *       200: { description: 看板数据 }
 */
dashboardRouter.get('/overview', (req, res) => {
  const days = req.query.days ? Math.min(Math.max(Number(req.query.days), 1), 90) : 14;
  sendOk(res, dashboardService.overview(days));
});

dashboardRouter.get('/live', (_req, res) => {
  sendOk(res, dashboardService.liveDashboard());
});

dashboardRouter.get('/todo', (_req, res) => {
  sendOk(res, dashboardService.todo());
});

dashboardRouter.get('/daily-reports', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 14;
  sendOk(res, dashboardService.dailyReports(limit));
});

/**
 * @openapi
 * /api/dashboard/audit-logs:
 *   get:
 *     tags: [系统]
 *     summary: 操作日志（写操作审计，管理员可查全部）
 *     responses:
 *       200: { description: 日志列表 }
 */
dashboardRouter.get('/audit-logs', requireRole('ADMIN', 'OPERATOR'), (req, res) => {
  const username = req.query.username ? String(req.query.username) : undefined;
  const resource = req.query.resource ? String(req.query.resource) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  sendOk(res, auditService.list({ username, resource, limit }));
});

dashboardRouter.get('/audit-statistics', requireRole('ADMIN'), (_req, res) => {
  sendOk(res, auditService.statistics());
});
