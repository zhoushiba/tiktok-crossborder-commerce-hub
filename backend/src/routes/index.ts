import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authRouter } from './auth';
import { shopRouter } from './shops';
import { currencyRouter } from './currencies';
import { productRouter } from './products';
import { liveRouter } from './liveSessions';
import { orderRouter } from './orders';
import { affiliateRouter } from './affiliates';
import { settlementRouter } from './settlements';
import { inventoryRouter } from './inventory';
import { dashboardRouter } from './dashboard';
import { trainingRouter } from './training';
import { systemRouter } from './system';

/**
 * /api 汇总路由：
 * - 认证与健康检查在 authenticate 之前挂载（登录、探针无需 token）
 * - 其余业务路由统一要求 Bearer token
 */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/system', systemRouter);

apiRouter.use(authenticate);

apiRouter.use('/shops', shopRouter);
apiRouter.use('/currencies', currencyRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/live-sessions', liveRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/affiliates', affiliateRouter);
apiRouter.use('/settlements', settlementRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/training', trainingRouter);
