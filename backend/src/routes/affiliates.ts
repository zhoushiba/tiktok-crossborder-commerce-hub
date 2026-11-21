import { Router } from 'express';
import { affiliateService } from '../services/affiliateService';
import { sendOk, sendCreated } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { influencerCreateSchema, linkCreateSchema } from './schemas';

export const affiliateRouter = Router();

/**
 * @openapi
 * /api/affiliates:
 *   get:
 *     tags: [达人分销]
 *     summary: 达人列表（含带货链接数、待结佣金、ROI）
 *     responses:
 *       200: { description: 达人列表 }
 *   post:
 *     tags: [达人分销]
 *     summary: 新增合作达人
 *     responses:
 *       201: { description: 创建成功 }
 */
affiliateRouter.get('/', (req, res) => {
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const region = req.query.region ? String(req.query.region) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  sendOk(res, affiliateService.listInfluencers({ keyword, region, status }));
});

affiliateRouter.get('/commissions', (req, res) => {
  const influencerId = req.query.influencerId ? Number(req.query.influencerId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  sendOk(res, affiliateService.listCommissions({ influencerId, status }));
});

affiliateRouter.get('/summary', (_req, res) => {
  sendOk(res, affiliateService.summary());
});

/**
 * @openapi
 * /api/affiliates/{id}/links:
 *   post:
 *     tags: [达人分销]
 *     summary: 为达人生成商品带货链接（短码 + UTM）
 *     responses:
 *       201: { description: 链接信息 }
 */
affiliateRouter.post('/:id/links', requireRole('OPERATOR'), auditTrail('affiliate'), (req, res) => {
  sendCreated(
    res,
    affiliateService.createLink({
      influencerId: Number(req.params.id),
      productId: Number(req.body?.productId),
      campaign: req.body?.campaign,
    }),
  );
});

affiliateRouter.post('/orders/:orderId/accrue', requireRole('OPERATOR'), auditTrail('affiliate'), (req, res) => {
  sendOk(res, affiliateService.accrueForOrder(Number(req.params.orderId)), '佣金计提完成');
});

affiliateRouter.get('/:id', (req, res) => {
  sendOk(res, affiliateService.detail(Number(req.params.id)));
});

affiliateRouter.post('/', requireRole('OPERATOR'), validateBody(influencerCreateSchema), auditTrail('affiliate'), (req, res) => {
  sendCreated(res, affiliateService.createInfluencer(req.body));
});

affiliateRouter.post('/links', requireRole('OPERATOR'), validateBody(linkCreateSchema), auditTrail('affiliate'), (req, res) => {
  sendCreated(res, affiliateService.createLink(req.body));
});
