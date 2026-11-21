import { Router } from 'express';
import { authService } from '../services/authService';
import { sendOk, sendCreated } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { authenticate, requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { loginSchema, registerSchema, createUserSchema } from './schemas';

export const authRouter = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     tags: [认证]
 *     summary: 注册运营/主播/机构账号
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, realName, role]
 *             properties:
 *               username: { type: string, example: operator02 }
 *               password: { type: string, example: Operator@123 }
 *               realName: { type: string, example: 王运营 }
 *               role: { type: string, enum: [OPERATOR, HOST, AGENCY] }
 *     responses:
 *       201: { description: 注册成功并返回 token }
 */
authRouter.post('/register', validateBody(registerSchema), auditTrail('auth'), (req, res) => {
  sendCreated(res, authService.register(req.body));
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [认证]
 *     summary: 登录获取 JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, example: admin }
 *               password: { type: string, example: Admin@123 }
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     token: { type: string }
 *                     user: { type: object }
 */
authRouter.post('/login', validateBody(loginSchema), auditTrail('auth'), (req, res) => {
  sendOk(res, authService.login(req.body), '登录成功');
});

authRouter.get('/me', authenticate, (req, res) => {
  sendOk(res, authService.profile(req.user!.id));
});

authRouter.get('/users', authenticate, requireRole('ADMIN'), (_req, res) => {
  sendOk(res, authService.listUsers());
});

authRouter.post('/users', authenticate, requireRole('ADMIN'), validateBody(createUserSchema), auditTrail('user'), (req, res) => {
  sendCreated(res, authService.createUser(req.body));
});
