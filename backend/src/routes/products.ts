import { Router } from 'express';
import { productService } from '../services/productService';
import { sendOk, sendCreated, toPage } from '../utils/response';
import { validateBody, validateQuery } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { csvImportSchema, idParam, productCreateSchema, productUpdateSchema, profitCalcSchema } from './schemas';
import { z } from 'zod';
import { productRepo } from '../repositories/productRepo';
import { ApiError } from '../utils/response';
import { yuanToCents } from '../utils/money';

export const productRouter = Router();

const listQuerySchema = z.object({
  keyword: z.string().max(64).optional(),
  category: z.string().max(32).optional(),
  status: z.string().max(16).optional(),
  siteCode: z.string().max(16).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [选品库]
 *     summary: 商品分页列表
 *     parameters:
 *       - { in: query, name: keyword, schema: { type: string } }
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: pageSize, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: 分页结果 }
 */
productRouter.get('/', validateQuery(listQuerySchema), (_req, res) => {
  const query = res.locals.query as z.infer<typeof listQuerySchema>;
  const data = productService.list(query);
  sendOk(res, toPage(data.list, data.total, query.page, query.pageSize));
});

productRouter.get('/categories', (_req, res) => {
  sendOk(res, productService.categories());
});

productRouter.get('/export.csv', (_req, res) => {
  const csv = productService.exportCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
  res.send(csv);
});

/**
 * @openapi
 * /api/products/profit-calc:
 *   post:
 *     tags: [选品库]
 *     summary: 跨境利润测算（毛利率/净利率/保本价）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               salePriceCent: { type: integer, example: 2999 }
 *               costPriceCent: { type: integer, example: 1200 }
 *               salePrice: { type: number, example: 29.99, description: '与 salePriceCent 二选一，单位为元' }
 *               costPrice: { type: number, example: 12, description: '与 costPriceCent 二选一，单位为元' }
 *               currencyCode: { type: string, example: USD }
 *               weightG: { type: integer, example: 350 }
 *               commissionRate: { type: number, example: 0.1 }
 *     responses:
 *       200: { description: 测算结果 }
 */
productRouter.post('/profit-calc', validateBody(profitCalcSchema), (req, res) => {
  const body = req.body as z.infer<typeof profitCalcSchema>;
  // 前端按「元」传 salePrice / costPrice，脚本与测试按「分」传 *Cent，这里统一折成分
  const salePriceCent = body.salePriceCent ?? (body.salePrice ? yuanToCents(body.salePrice) : undefined);
  const costPriceCent = body.costPriceCent ?? (body.costPrice ? yuanToCents(body.costPrice) : undefined);
  if (body.productId) {
    const product = productRepo.findById(body.productId);
    if (!product) throw ApiError.notFound(`商品 ${body.productId} 不存在`);
    sendOk(
      res,
      productService.calculateProfit({
        salePriceCent: salePriceCent ?? product.sale_price_cent,
        costPriceCent: costPriceCent ?? product.cost_price_cent,
        currencyCode: body.currencyCode ?? product.currency_code,
        weightG: body.weightG ?? product.weight_g,
        commissionRate: body.commissionRate ?? product.commission_rate,
        rate: body.rate,
        extraCostCent: body.extraCostCent,
      }),
    );
    return;
  }
  if (!salePriceCent || !costPriceCent || !body.weightG) {
    throw ApiError.badRequest(
      '未指定 productId 时必须提供 salePrice / costPrice（元）或 salePriceCent / costPriceCent（分），以及 weightG',
    );
  }
  sendOk(
    res,
    productService.calculateProfit({
      salePriceCent,
      costPriceCent,
      currencyCode: body.currencyCode,
      weightG: body.weightG,
      commissionRate: body.commissionRate,
      rate: body.rate,
      extraCostCent: body.extraCostCent,
    }),
  );
});

productRouter.post('/import', requireRole('OPERATOR'), validateBody(csvImportSchema), auditTrail('product'), (req, res) => {
  sendOk(res, productService.importCsv(req.body.csv, req.user!.username));
});

productRouter.get('/:id', (req, res) => {
  sendOk(res, productService.detail(Number(req.params.id)));
});

productRouter.get('/:id/profit', (req, res) => {
  sendOk(res, productService.detail(Number(req.params.id)).profit);
});

productRouter.post('/', requireRole('OPERATOR'), validateBody(productCreateSchema), auditTrail('product'), (req, res) => {
  sendCreated(res, productService.create(req.body));
});

productRouter.patch('/:id', requireRole('OPERATOR'), validateBody(productUpdateSchema), auditTrail('product'), (req, res) => {
  sendOk(res, productService.update(Number(req.params.id), req.body));
});

productRouter.delete('/:id', requireRole('OPERATOR'), auditTrail('product'), (req, res) => {
  sendOk(res, productService.removeOrArchive(Number(idParam.parse(req.params).id)));
});
