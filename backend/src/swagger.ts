/**
 * OpenAPI 3.0 文档（手写定义，完全可控，不依赖运行时反射扫描）。
 * 挂载在 /api/docs，供联调同学与面试官直接浏览。
 */

type Operation = Record<string, unknown>;

function op(tag: string, summary: string, extra: Operation = {}): Operation {
  return {
    tags: [tag],
    summary,
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: '成功（统一响应体 code=0）' },
      400: { description: '参数校验失败（code=40000）' },
      401: { description: '未登录或 token 过期（code=40100）' },
      409: { description: '业务状态冲突（code=40900）' },
    },
    ...extra,
  };
}

function publicOp(tag: string, summary: string, extra: Operation = {}): Operation {
  const base = op(tag, summary, extra);
  base.security = [];
  return base;
}

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'TikTok 跨境直播电商中台 API',
    version: '1.0.0',
    description: `面向 TikTok 跨境直播电商的一体化中台：店铺站点、选品与利润测算、直播场次、订单履约、达人分佣结算、数据看板、实训与审计。

- 统一响应体：\`{ code, message, data, requestId, timestamp }\`，code=0 表示成功
- 鉴权：\`Authorization: Bearer <token>\`（JWT，12 小时有效）
- 金额：接口入参与出参同时提供「分」(xxx_cent) 与「元」(xxx_yuan)，内部一律以整数分计算
- 幂等：订单同步以 shop_id + platform_order_id 去重；佣金以 influencer_id + order_id 去重`,
  },
  servers: [{ url: 'http://localhost:3000', description: '本地开发环境' }],
  tags: [
    { name: '认证', description: '登录注册与用户管理' },
    { name: '店铺站点', description: 'TikTok 店铺授权与多站点' },
    { name: '汇率币种', description: '多币种汇率与换算' },
    { name: '选品库', description: '商品 SKU、利润测算、CSV 导入导出' },
    { name: '直播场次', description: '排期、中控打点、复盘' },
    { name: '订单履约', description: '订单同步、发货、退货退款、导出' },
    { name: '达人分销', description: '达人、带货链接、佣金计提' },
    { name: '结算佣金', description: '结算单生成与状态流转' },
    { name: '库存物流', description: '安全库存预警与物流异常' },
    { name: '数据看板', description: 'GMV/订单/站点占比/Top 商品' },
    { name: '实训管理', description: '学员、任务、成绩录入' },
    { name: '系统', description: '健康检查、配置、操作日志' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      ApiEnvelope: {
        type: 'object',
        properties: {
          code: { type: 'integer', example: 0 },
          message: { type: 'string', example: 'success' },
          data: { type: 'object', nullable: true },
          requestId: { type: 'string', example: 'b1f0c2d4-8a2e-4a3f-9f5e-6c7d8e9f0a1b' },
          timestamp: { type: 'integer', example: 1763769600000 },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin' },
          password: { type: 'string', example: 'Admin@123' },
        },
      },
      ProfitCalcRequest: {
        type: 'object',
        properties: {
          productId: { type: 'integer', example: 1 },
          salePriceYuan: { type: 'number', example: 29.99 },
          costPriceYuan: { type: 'number', example: 12 },
          weightG: { type: 'integer', example: 350 },
          currency: { type: 'string', example: 'USD' },
          commissionRate: { type: 'number', example: 0.1 },
        },
      },
      OrderSyncRequest: {
        type: 'object',
        properties: {
          shopId: { type: 'integer', example: 1 },
          status: { type: 'string', example: 'PAID' },
          pageSize: { type: 'integer', example: 50 },
        },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: publicOp('认证', '账号密码登录，返回 JWT', {
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: {
          200: { description: '登录成功，data.token 为 JWT' },
          401: { description: '用户名或密码错误（code=40100）' },
          403: { description: '账号被停用（code=40300）' },
        },
      }),
    },
    '/api/auth/register': {
      post: publicOp('认证', '注册运营/主播/机构代理账号（不允许注册管理员）', {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password', 'realName'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string', minLength: 6 },
                  realName: { type: 'string' },
                  role: { type: 'string', enum: ['OPERATOR', 'HOST', 'AGENCY'] },
                  email: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: '注册成功' }, 400: { description: '角色非法或用户名重复' } },
      }),
    },
    '/api/auth/me': { get: op('认证', '当前登录用户信息') },
    '/api/auth/users': {
      get: op('认证', '用户列表（仅管理员）'),
      post: op('认证', '创建用户（仅管理员）'),
    },
    '/api/shops': {
      get: op('店铺站点', '店铺列表（app_secret / access_token 脱敏）'),
      post: op('店铺站点', '新建店铺（region 支持 US/UK/SEA）'),
    },
    '/api/shops/{id}': { get: op('店铺站点', '店铺详情') },
    '/api/shops/{id}/sites': { get: op('店铺站点', '店铺下属站点列表') },
    '/api/shops/{id}/authorize': { post: op('店铺站点', '触发授权（对接开放平台换取 token）') },
    '/api/shops/{id}/status': { patch: op('店铺站点', '启用/暂停/过期') },
    '/api/currencies': { get: op('汇率币种', '币种列表') },
    '/api/currencies/rates': { get: op('汇率币种', '汇率列表（含倒数对）') },
    '/api/currencies/convert': { post: op('汇率币种', '金额换算（自动取最新生效汇率）') },
    '/api/products': {
      get: op('选品库', '商品分页列表（keyword/category/status/siteCode）'),
      post: op('选品库', '新建商品 SKU'),
    },
    '/api/products/categories': { get: op('选品库', '类目聚合') },
    '/api/products/profit-calc': { post: op('选品库', '利润测算：售价/成本/物流/平台费/佣金 → 毛利率与保本价') },
    '/api/products/import': { post: op('选品库', 'CSV 批量导入（逐行校验并返回错误明细）') },
    '/api/products/export.csv': { get: op('选品库', '导出 CSV（含毛利与毛利率）') },
    '/api/products/{id}': {
      get: op('选品库', '商品详情（含成本明细、库存、利润测算）'),
      patch: op('选品库', '更新商品'),
      delete: op('选品库', '软下架商品（状态置 ARCHIVED）'),
    },
    '/api/products/{id}/profit': { get: op('选品库', '单商品利润测算') },
    '/api/live-sessions': {
      get: op('直播场次', '场次列表（含目标达成率）'),
      post: op('直播场次', '创建场次排期'),
    },
    '/api/live-sessions/upcoming': { get: op('直播场次', '即将开始的场次') },
    '/api/live-sessions/{id}': { get: op('直播场次', '场次详情（含指标曲线）') },
    '/api/live-sessions/{id}/status': { post: op('直播场次', '状态流转 PLANNED→LIVE→ENDED→REVIEWED') },
    '/api/live-sessions/{id}/metrics': { post: op('直播场次', '中控打点（在线人数/GMV/订单）') },
    '/api/live-sessions/{id}/review': { post: op('直播场次', '复盘记录（必须填写结论）') },
    '/api/orders': { get: op('订单履约', '订单分页列表（含 48 小时未发货标记）') },
    '/api/orders/sync': { post: op('订单履约', '从开放平台拉单并幂等入库') },
    '/api/orders/export.csv': { get: op('订单履约', '订单导出 CSV（UTF-8 BOM）') },
    '/api/orders/overdue': { get: op('订单履约', '超时未发货订单') },
    '/api/orders/{id}': { get: op('订单履约', '订单详情（明细/状态流水/物流）') },
    '/api/orders/{id}/ship': { post: op('订单履约', '发货：扣减库存并生成头程物流单') },
    '/api/orders/{id}/delivery': { post: op('订单履约', '确认妥投（写尾程物流）') },
    '/api/orders/{id}/refund': { post: op('订单履约', '退货退款申请/同意/拒绝') },
    '/api/orders/{id}/status': { patch: op('订单履约', '人工纠正订单状态（白名单）') },
    '/api/affiliates': {
      get: op('达人分销', '达人列表（带货链接数、待结佣金、ROI）'),
      post: op('达人分销', '新增达人（handle 需 @ 开头）'),
    },
    '/api/affiliates/commissions': { get: op('达人分销', '佣金明细') },
    '/api/affiliates/summary': { get: op('达人分销', '佣金汇总') },
    '/api/affiliates/{id}': { get: op('达人分销', '达人详情（链接/样品/佣金与转化率）') },
    '/api/affiliates/{id}/links': { post: op('达人分销', '为达人生成商品带货短链') },
    '/api/affiliates/orders/{orderId}/accrue': { post: op('达人分销', '按已妥投订单计提佣金（幂等）') },
    '/api/settlements': {
      get: op('结算佣金', '结算单列表'),
      post: op('结算佣金', '按达人+周期生成结算单（汇总 PENDING 佣金）'),
    },
    '/api/settlements/summary': { get: op('结算佣金', '结算汇总（按状态 + 本月）') },
    '/api/settlements/{id}': { get: op('结算佣金', '结算单详情（含佣金明细）') },
    '/api/settlements/{id}/status': { patch: op('结算佣金', '状态流转 DRAFT→PENDING→APPROVED→PAID') },
    '/api/inventory': { get: op('库存物流', '库存列表（低库存/店铺筛选）') },
    '/api/inventory/low-stock': { get: op('库存物流', '安全库存预警') },
    '/api/inventory/adjust': { patch: op('库存物流', '库存调整（入库/盘点）') },
    '/api/inventory/logistics': { get: op('库存物流', '物流单列表（异常筛选）') },
    '/api/inventory/logistics/{id}/exception': { post: op('库存物流', '标记物流异常') },
    '/api/inventory/logistics/{id}/status': { patch: op('库存物流', '推进物流状态') },
    '/api/dashboard/overview': { get: op('数据看板', '总览看板聚合数据') },
    '/api/dashboard/live': { get: op('数据看板', '直播罗盘（场次 ROI）') },
    '/api/dashboard/todo': { get: op('数据看板', '待办事项（超时/异常/低库存/待结算）') },
    '/api/dashboard/daily-reports': { get: op('数据看板', '每日报表') },
    '/api/dashboard/audit-logs': { get: op('系统', '操作日志（写操作审计）') },
    '/api/dashboard/audit-statistics': { get: op('系统', '操作日志统计（仅管理员）') },
    '/api/training/overview': { get: op('实训管理', '实训总览与通过率') },
    '/api/training/students': {
      get: op('实训管理', '学员列表'),
      post: op('实训管理', '新增学员'),
    },
    '/api/training/tasks': {
      get: op('实训管理', '实训任务列表'),
      post: op('实训管理', '新建实训任务'),
    },
    '/api/training/scores': {
      get: op('实训管理', '成绩列表'),
      post: op('实训管理', '录入/覆盖成绩'),
    },
    '/api/system/health': { get: publicOp('系统', '健康检查（无需登录）') },
    '/api/system/config': { get: op('系统', '系统配置项') },
    '/api/system/webhook/verify': {
      post: publicOp('系统', '校验开放平台回调签名（HMAC + 时间戳防重放）'),
    },
  },
};
