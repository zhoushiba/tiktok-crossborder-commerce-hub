import { Router } from 'express';
import { inventoryService } from '../services/inventoryService';
import { sendOk } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { inventoryAdjustSchema, logisticsExceptionSchema, logisticsStatusSchema } from './schemas';

export const inventoryRouter = Router();

/**
 * @openapi
 * /api/inventory:
 *   get:
 *     tags: [库存物流]
 *     summary: 库存列表（可按店铺、低库存筛选）
 *     parameters:
 *       - { in: query, name: shopId, schema: { type: integer } }
 *       - { in: query, name: lowStockOnly, schema: { type: boolean } }
 *       - { in: query, name: keyword, schema: { type: string } }
 *     responses:
 *       200: { description: 库存列表 }
 * /api/inventory/low-stock:
 *   get:
 *     tags: [库存物流]
 *     summary: 低于安全库存的商品（补货预警）
 *     responses:
 *       200: { description: 预警列表 }
 */
inventoryRouter.get('/', (req, res) => {
  const shopId = req.query.shopId ? Number(req.query.shopId) : undefined;
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const lowStockOnly = req.query.lowStockOnly === 'true';
  sendOk(res, inventoryService.list({ shopId, keyword, lowStockOnly }));
});

inventoryRouter.get('/low-stock', (_req, res) => {
  sendOk(res, inventoryService.lowStock());
});

inventoryRouter.get('/logistics', (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const exceptionOnly = req.query.exceptionOnly === 'true';
  sendOk(res, inventoryService.logistics({ status, exceptionOnly }));
});

inventoryRouter.patch('/adjust', requireRole('OPERATOR'), validateBody(inventoryAdjustSchema), auditTrail('inventory'), (req, res) => {
  sendOk(res, inventoryService.adjust(req.body), '库存已调整');
});

inventoryRouter.post('/logistics/:id/exception', requireRole('OPERATOR'), validateBody(logisticsExceptionSchema), auditTrail('logistics'), (req, res) => {
  sendOk(res, inventoryService.markException(Number(req.params.id), req.body.reason));
});

inventoryRouter.patch('/logistics/:id/status', requireRole('OPERATOR'), validateBody(logisticsStatusSchema), auditTrail('logistics'), (req, res) => {
  sendOk(res, inventoryService.advance(Number(req.params.id), req.body.status));
});
