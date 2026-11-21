import { Router } from 'express';
import { trainingService } from '../services/trainingService';
import { sendOk, sendCreated } from '../utils/response';
import { validateBody } from '../middlewares/validate';
import { requireRole } from '../middlewares/auth';
import { auditTrail } from '../middlewares/observability';
import { gradeSchema, studentCreateSchema, taskCreateSchema } from './schemas';

export const trainingRouter = Router();

/**
 * @openapi
 * /api/training/overview:
 *   get:
 *     tags: [实训管理]
 *     summary: 实训总览（学员、任务、成绩统计与通过率）
 *     responses:
 *       200: { description: 实训数据 }
 */
trainingRouter.get('/overview', (_req, res) => {
  sendOk(res, trainingService.overview());
});

trainingRouter.get('/students', (_req, res) => {
  sendOk(res, trainingService.students());
});

trainingRouter.post('/students', requireRole('OPERATOR'), validateBody(studentCreateSchema), auditTrail('training'), (req, res) => {
  sendCreated(res, trainingService.createStudent(req.body));
});

trainingRouter.get('/tasks', (_req, res) => {
  sendOk(res, trainingService.tasks());
});

trainingRouter.post('/tasks', requireRole('OPERATOR'), validateBody(taskCreateSchema), auditTrail('training'), (req, res) => {
  sendCreated(res, trainingService.createTask(req.body));
});

trainingRouter.get('/scores', (req, res) => {
  const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
  const taskId = req.query.taskId ? Number(req.query.taskId) : undefined;
  sendOk(res, trainingService.scores({ studentId, taskId }));
});

/**
 * @openapi
 * /api/training/scores:
 *   post:
 *     tags: [实训管理]
 *     summary: 录入/更新实训成绩（同一学员同一任务幂等覆盖）
 *     responses:
 *       200: { description: 成绩记录 }
 *       400: { description: 成绩超出满分 }
 */
trainingRouter.post('/scores', requireRole('OPERATOR'), validateBody(gradeSchema), auditTrail('training'), (req, res) => {
  sendOk(res, trainingService.grade(req.body), '成绩已保存');
});
