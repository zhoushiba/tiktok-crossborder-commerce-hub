import { Router } from 'express';
import { currencyService } from '../services/currencyService';
import { sendOk, sendCreated } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { convertSchema, rateUpdateSchema, rateUpsertSchema } from './schemas';

export const currencyRouter = Router();

/**
 * @openapi
 * /api/currencies:
 *   get:
 *     tags: [币种汇率]
 *     summary: 币种列表
 *     responses:
 *       200: { description: 币种列表（USD/GBP/SGD/CNY） }
 * /api/currencies/rates:
 *   get:
 *     tags: [币种汇率]
 *     summary: 汇率列表（含货币对与反向汇率）
 *     responses:
 *       200: { description: 汇率列表 }
 */
currencyRouter.get('/', (_req, res) => {
  sendOk(res, currencyService.listCurrencies());
});

currencyRouter.get('/rates', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  sendOk(res, currencyService.listRates(limit));
});

currencyRouter.post('/convert', validateBody(convertSchema), (req, res) => {
  sendOk(res, currencyService.convert(req.body));
});

currencyRouter.post('/rates', requireRole('OPERATOR'), validateBody(rateUpsertSchema), auditTrail('currency'), (req, res) => {
  sendCreated(res, currencyService.upsertRate(req.body));
});

currencyRouter.patch('/rates/:id', requireRole('OPERATOR'), validateBody(rateUpdateSchema), auditTrail('currency'), (req, res) => {
  sendOk(res, currencyService.updateRate(Number(req.params.id), req.body.rate));
});
