import { Router } from 'express';
import { liveService } from '../services/liveService';
import { sendOk, sendCreated } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { liveCreateSchema, liveMetricSchema, liveTransitionSchema } from './schemas';

export const liveRouter = Router();

/**
 * @openapi
 * /api/live-sessions:
 *   get:
 *     tags: [直播场次]
 *     summary: 场次列表（含目标达成率）
 *     parameters:
 *       - { in: query, name: shopId, schema: { type: integer } }
 *       - { in: query, name: status, schema: { type: string, enum: [PLANNED, LIVE, ENDED, REVIEWED] } }
 *     responses:
 *       200: { description: 场次列表 }
 *   post:
 *     tags: [直播场次]
 *     summary: 创建直播场次排期
 *     responses:
 *       201: { description: 创建成功 }
 */
liveRouter.get('/', (req, res) => {
  const shopId = req.query.shopId ? Number(req.query.shopId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  sendOk(res, liveService.list({ shopId, status }));
});

liveRouter.get('/upcoming', (_req, res) => {
  sendOk(res, liveService.upcoming());
});

liveRouter.get('/:id', (req, res) => {
  sendOk(res, liveService.detail(Number(req.params.id)));
});

liveRouter.post('/', requireRole('OPERATOR', 'HOST'), validateBody(liveCreateSchema), auditTrail('live_session'), (req, res) => {
  sendCreated(res, liveService.create(req.body));
});

/**
 * @openapi
 * /api/live-sessions/{id}/status:
 *   post:
 *     tags: [直播场次]
 *     summary: 场次状态流转（PLANNED → LIVE → ENDED → REVIEWED）
 *     responses:
 *       200: { description: 流转后的场次详情 }
 *       409: { description: 非法状态流转 }
 */
liveRouter.post('/:id/status', requireRole('OPERATOR', 'HOST'), validateBody(liveTransitionSchema), auditTrail('live_session'), (req, res) => {
  const { status, ...payload } = req.body;
  sendOk(res, liveService.transition(Number(req.params.id), status, payload));
});

liveRouter.post('/:id/metrics', requireRole('OPERATOR', 'HOST'), validateBody(liveMetricSchema), (req, res) => {
  sendOk(res, liveService.pushMetric(Number(req.params.id), req.body));
});

liveRouter.post('/:id/review', requireRole('OPERATOR'), auditTrail('live_session'), (req, res) => {
  sendOk(res, liveService.review(Number(req.params.id), req.body?.note));
});
