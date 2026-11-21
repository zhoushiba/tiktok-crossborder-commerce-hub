import express, { Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './swagger';
import { apiRouter } from './routes';
import { requestContext } from './middlewares/observability';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { rateLimit } from './middlewares/rateLimit';
import { config } from './config';

/**
 * 创建 API 应用（不负责启动端口，便于测试用 supertest 直接挂载）。
 * 中间件顺序：日志/请求号 → CORS → body 解析 → 全局限流 → 文档 → 业务路由 → 404 → 统一异常。
 */
export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestContext(config.env !== 'test'));
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 全局限流：防止脚本误刷接口（窗口内超限返回 429）
  app.use('/api', rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }));

  app.get('/', (_req, res) => {
    res.json({
      name: 'tiktok-crossborder-commerce-hub',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/api/system/health',
    });
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'TikTok 跨境中台 API' }));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
