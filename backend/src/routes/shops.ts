import { Router } from 'express';
import { shopService } from '../services/shopService';
import { sendOk, sendCreated } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { shopCreateSchema, shopStatusSchema } from './schemas';

export const shopRouter = Router();

/**
 * @openapi
 * /api/shops:
 *   get:
 *     tags: [店铺]
 *     summary: 店铺列表（含站点、订单统计、Token 状态）
 *     responses:
 *       200: { description: 店铺列表 }
 *   post:
 *     tags: [店铺]
 *     summary: 新增店铺（运营/管理员）
 *     responses:
 *       201: { description: 创建成功 }
 */
shopRouter.get('/', (_req, res) => {
  sendOk(res, shopService.list());
});

shopRouter.get('/:id', (req, res) => {
  sendOk(res, shopService.detail(Number(req.params.id)));
});

shopRouter.get('/:id/sites', (req, res) => {
  sendOk(res, shopService.sites(Number(req.params.id)));
});

shopRouter.post('/', requireRole('OPERATOR'), validateBody(shopCreateSchema), auditTrail('shop'), (req, res) => {
  sendCreated(res, shopService.create(req.body));
});

shopRouter.post('/:id/authorize', requireRole('OPERATOR'), auditTrail('shop'), (req, res) => {
  sendOk(res, shopService.authorize(Number(req.params.id)), '授权成功');
});

shopRouter.patch('/:id/status', requireRole('OPERATOR'), validateBody(shopStatusSchema), auditTrail('shop'), (req, res) => {
  sendOk(res, shopService.updateStatus(Number(req.params.id), req.body.status));
});
