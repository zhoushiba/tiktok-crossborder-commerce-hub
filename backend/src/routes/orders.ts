import { Router } from 'express';
import { orderService } from '../services/orderService';
import { sendOk, toPage } from '../utils/response';
import { validateBody, validateQuery } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { orderQuerySchema, orderStatusSchema, orderSyncSchema, refundSchema, shipSchema } from './schemas';
import { z } from 'zod';

export const orderRouter = Router();

/**
 * @openapi
 * /api/orders:
 *   get:
 *     tags: [订单履约]
 *     summary: 订单分页列表
 *     parameters:
 *       - { in: query, name: shopId, schema: { type: integer } }
 *       - { in: query, name: status, schema: { type: string } }
 *       - { in: query, name: keyword, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: 分页订单 }
 */
orderRouter.get('/', validateQuery(orderQuerySchema), (_req, res) => {
  const query = res.locals.query as z.infer<typeof orderQuerySchema>;
  const data = orderService.list(query);
  sendOk(res, toPage(data.list, data.total, query.page, query.pageSize));
});

orderRouter.get('/export.csv', validateQuery(orderQuerySchema), (_req, res) => {
  const query = res.locals.query as z.infer<typeof orderQuerySchema>;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(orderService.exportCsv(query));
});

orderRouter.get('/overdue', (_req, res) => {
  sendOk(res, orderService.overdue());
});

/**
 * @openapi
 * /api/orders/sync:
 *   post:
 *     tags: [订单履约]
 *     summary: 从 TikTok 开放平台（Mock 网关）拉取订单并幂等入库
 *     description: 幂等键 shop_id + platform_order_id；重复订单只计数不重复写库。
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shopId: { type: integer, example: 1 }
 *               status: { type: string, example: PAID }
 *     responses:
 *       200: { description: 同步结果统计 }
 */
orderRouter.post('/sync', requireRole('OPERATOR'), validateBody(orderSyncSchema), auditTrail('order'), async (req, res, next) => {
  try {
    const result = await orderService.sync(req.body);
    sendOk(res, result, '同步完成');
  } catch (error) {
    next(error);
  }
});

orderRouter.get('/:id', (req, res) => {
  sendOk(res, orderService.detail(Number(req.params.id)));
});

orderRouter.post('/:id/ship', requireRole('OPERATOR'), validateBody(shipSchema), auditTrail('order'), (req, res) => {
  sendOk(res, orderService.ship(Number(req.params.id), req.body));
});

orderRouter.post('/:id/delivery', requireRole('OPERATOR'), auditTrail('order'), (req, res) => {
  sendOk(res, orderService.confirmDelivery(Number(req.params.id), req.body ?? {}));
});

orderRouter.post('/:id/refund', requireRole('OPERATOR'), validateBody(refundSchema), auditTrail('order'), (req, res) => {
  sendOk(res, orderService.refund(Number(req.params.id), req.body));
});

orderRouter.patch('/:id/status', requireRole('OPERATOR'), validateBody(orderStatusSchema), auditTrail('order'), (req, res) => {
  sendOk(res, orderService.updateStatus(Number(req.params.id), req.body.status, req.body.remark));
});
