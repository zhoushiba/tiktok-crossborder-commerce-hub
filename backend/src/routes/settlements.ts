import { Router } from 'express';
import { settlementService } from '../services/settlementService';
import { sendOk, sendCreated } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { settlementCreateSchema, settlementStatusSchema } from './schemas';

export const settlementRouter = Router();

/**
 * @openapi
 * /api/settlements:
 *   get:
 *     tags: [结算佣金]
 *     summary: 结算单列表
 *     responses:
 *       200: { description: 结算单列表 }
 *   post:
 *     tags: [结算佣金]
 *     summary: 按达人+周期生成结算单（自动汇总 PENDING 佣金）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [influencerId, periodStart, periodEnd]
 *             properties:
 *               influencerId: { type: integer, example: 1 }
 *               periodStart: { type: string, example: '2026-10-01' }
 *               periodEnd: { type: string, example: '2026-11-30' }
 *     responses:
 *       201: { description: 结算单详情（含明细） }
 *       409: { description: 该周期无待结算佣金 }
 */
settlementRouter.get('/', (req, res) => {
  const influencerId = req.query.influencerId ? Number(req.query.influencerId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  sendOk(res, settlementService.list({ influencerId, status }));
});

settlementRouter.get('/summary', (_req, res) => {
  sendOk(res, settlementService.summary());
});

settlementRouter.post('/', requireRole('OPERATOR'), validateBody(settlementCreateSchema), auditTrail('settlement'), (req, res) => {
  sendCreated(res, settlementService.create(req.body));
});

settlementRouter.get('/:id', (req, res) => {
  sendOk(res, settlementService.detail(Number(req.params.id)));
});

/**
 * @openapi
 * /api/settlements/{id}/status:
 *   patch:
 *     tags: [结算佣金]
 *     summary: 结算单状态流转（DRAFT → PENDING → APPROVED → PAID）
 *     responses:
 *       200: { description: 结算单详情 }
 *       409: { description: 非法状态流转 }
 */
settlementRouter.patch('/:id/status', requireRole('OPERATOR'), validateBody(settlementStatusSchema), auditTrail('settlement'), (req, res) => {
  sendOk(res, settlementService.updateStatus(Number(req.params.id), req.body.status));
});
