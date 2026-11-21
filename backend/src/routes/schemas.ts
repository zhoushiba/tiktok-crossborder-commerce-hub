import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const loginSchema = z.object({
  username: z.string().min(3, '用户名至少 3 个字符').max(32),
  password: z.string().min(6, '密码至少 6 个字符').max(64),
});

export const registerSchema = loginSchema.extend({
  realName: z.string().min(1, '请填写姓名').max(32),
  role: z.enum(['OPERATOR', 'HOST', 'AGENCY']).default('OPERATOR'),
  email: z.string().email('邮箱格式不正确').optional(),
});

export const createUserSchema = loginSchema.extend({
  realName: z.string().min(1).max(32),
  role: z.enum(['ADMIN', 'OPERATOR', 'HOST', 'AGENCY']),
  email: z.string().email().optional(),
});

export const shopCreateSchema = z.object({
  shopName: z.string().min(2, '店铺名称至少 2 个字符').max(64),
  region: z.enum(['US', 'UK', 'SEA']),
  currencyCode: z.enum(['USD', 'GBP', 'SGD', 'CNY']),
  timezone: z.string().min(3).optional(),
  siteCode: z.string().min(2).max(16).optional(),
  siteName: z.string().max(64).optional(),
  country: z.string().max(32).optional(),
});

export const shopStatusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED']) });

export const rateUpsertSchema = z.object({
  baseCurrency: z.string().length(3).toUpperCase(),
  quoteCurrency: z.string().length(3).toUpperCase(),
  rate: z.number().positive('汇率必须为正数'),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生效日期格式应为 YYYY-MM-DD'),
  source: z.string().max(32).optional(),
});

export const rateUpdateSchema = z.object({ rate: z.number().positive('汇率必须为正数') });

export const convertSchema = z.object({
  amountCent: z.number().int().positive('金额必须为正整数（分）'),
  base: z.string().length(3).toUpperCase(),
  quote: z.string().length(3).toUpperCase(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const productCreateSchema = z.object({
  sku: z.string().min(3, 'SKU 至少 3 个字符').max(48),
  title: z.string().min(2).max(200),
  category: z.string().min(1).max(32),
  costPrice: z.number().positive('成本价必须大于 0'),
  salePrice: z.number().positive('售价必须大于 0'),
  currencyCode: z.enum(['USD', 'GBP', 'SGD', 'CNY']),
  weightG: z.number().int().positive('重量必须大于 0'),
  volumeCm3: z.number().int().positive().optional(),
  commissionRate: z.number().min(0).max(0.5).optional(),
  shippingMode: z.enum(['CROSS_BORDER', 'FBA', 'LOCAL_WAREHOUSE']).optional(),
  siteCode: z.string().max(16).optional(),
});

export const productUpdateSchema = productCreateSchema.partial().extend({
  // OFF_SALE 是页面上的「已下架」，OFF_SHELF 为兼容早期数据保留
  status: z.enum(['ON_SALE', 'OFF_SALE', 'OFF_SHELF', 'ARCHIVED']).optional(),
});

export const profitCalcSchema = z.object({
  productId: z.number().int().positive().optional(),
  salePriceCent: z.number().int().positive().optional(),
  costPriceCent: z.number().int().positive().optional(),
  // 前端的利润测算器按「元」输入，允许直接传售价/成本价（元），由路由换算成分；
  // 保留 *Cent 字段是为了让脚本与测试能精确到分。
  salePrice: z.number().positive('售价必须大于 0').optional(),
  costPrice: z.number().positive('成本价必须大于 0').optional(),
  currencyCode: z.enum(['USD', 'GBP', 'SGD', 'CNY']).default('USD'),
  weightG: z.number().int().positive().optional(),
  commissionRate: z.number().min(0).max(0.5).default(0.1),
  rate: z.number().positive().optional(),
  extraCostCent: z.number().int().min(0).optional(),
});

export const csvImportSchema = z.object({
  csv: z.string().min(10, 'CSV 内容过短'),
  fileName: z.string().max(120).optional(),
});

export const liveCreateSchema = z.object({
  shopId: z.number().int().positive(),
  title: z.string().min(2).max(120),
  hostName: z.string().min(1).max(32),
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, '时间格式应为 YYYY-MM-DD HH:mm:ss'),
  durationMin: z.number().int().min(15).max(720).optional(),
  gmvTargetYuan: z.number().min(0).optional(),
});

export const liveTransitionSchema = z.object({
  status: z.enum(['LIVE', 'ENDED', 'REVIEWED', 'CANCELLED']),
  actualGmvYuan: z.number().min(0).optional(),
  viewers: z.number().int().min(0).optional(),
  peakOnline: z.number().int().min(0).optional(),
  ordersCount: z.number().int().min(0).optional(),
  reviewNote: z.string().max(500).optional(),
});

export const liveMetricSchema = z.object({
  onlineCount: z.number().int().min(0),
  gmvYuan: z.number().min(0),
  orders: z.number().int().min(0),
});

export const orderQuerySchema = z.object({
  shopId: z.coerce.number().int().positive().optional(),
  status: z.string().max(16).optional(),
  keyword: z.string().max(64).optional(),
  siteCode: z.string().max(16).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  overdueOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export const orderSyncSchema = z.object({
  shopId: z.number().int().positive().optional(),
  status: z.string().max(16).optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
});

export const shipSchema = z.object({
  carrier: z.string().max(32).optional(),
  trackingNo: z.string().max(48).optional(),
  deductInventory: z.boolean().optional(),
});

export const refundSchema = z.object({
  refundStatus: z.enum(['REQUESTED', 'APPROVED', 'REJECTED']),
  refundAmountYuan: z.number().min(0).optional(),
  reason: z.string().max(200).optional(),
});

export const orderStatusSchema = z.object({
  status: z.enum(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'REFUNDING', 'REFUNDED', 'CANCELLED']),
  remark: z.string().max(200).optional(),
});

export const influencerCreateSchema = z.object({
  nickname: z.string().min(1).max(48),
  handle: z.string().regex(/^@[a-zA-Z0-9._]{3,30}$/, '达人账号需以 @ 开头'),
  followers: z.number().int().min(0),
  category: z.string().min(1).max(32),
  commissionRate: z.number().min(0).max(0.5).optional(),
  region: z.enum(['US', 'UK', 'SEA']),
});

export const linkCreateSchema = z.object({
  influencerId: z.number().int().positive(),
  productId: z.number().int().positive(),
  campaign: z.string().max(48).optional(),
});

export const settlementCreateSchema = z.object({
  influencerId: z.number().int().positive(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remark: z.string().max(200).optional(),
});

export const settlementStatusSchema = z.object({ status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'PAID']) });

export const inventoryAdjustSchema = z.object({
  productId: z.number().int().positive(),
  shopId: z.number().int().positive(),
  availableQty: z.number().int().min(0),
  safetyQty: z.number().int().min(0).optional(),
  warehouse: z.string().max(32).optional(),
});

export const logisticsExceptionSchema = z.object({ reason: z.string().min(2, '请填写异常原因').max(200) });
export const logisticsStatusSchema = z.object({ status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED']) });

export const studentCreateSchema = z.object({
  name: z.string().min(1).max(32),
  school: z.string().min(2).max(64),
  major: z.string().max(64).optional(),
  phone: z.string().max(20).optional(),
});

export const taskCreateSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  points: z.number().int().min(1).max(100).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const gradeSchema = z.object({
  studentId: z.number().int().positive(),
  taskId: z.number().int().positive(),
  score: z.number().int().min(0).max(100),
  feedback: z.string().max(300).optional(),
});
