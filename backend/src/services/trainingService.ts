import { trainingRepo, auditRepo } from '../repositories/trainingRepo';
import { ApiError } from '../utils/response';

export const trainingService = {
  overview() {
    const students = trainingRepo.students() as Array<Record<string, unknown>>;
    const tasks = trainingRepo.tasks() as Array<Record<string, unknown>>;
    const graded = students.filter((row) => row.avg_score !== null);
    const passed = graded.filter((row) => Number(row.avg_score) >= 75).length;
    return {
      statistics: trainingRepo.statistics(),
      students,
      tasks,
      passRate: graded.length ? Number(((passed / graded.length) * 100).toFixed(2)) : 0,
    };
  },

  students() {
    return trainingRepo.students();
  },

  createStudent(input: { name: string; school: string; major?: string; phone?: string }) {
    const id = trainingRepo.createStudent(input);
    return trainingRepo.findStudent(id);
  },

  tasks() {
    return trainingRepo.tasks();
  },

  createTask(input: { title: string; description?: string; points?: number; dueDate?: string }) {
    if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      throw ApiError.badRequest('dueDate 格式应为 YYYY-MM-DD');
    }
    const id = trainingRepo.createTask(input);
    return (trainingRepo.tasks() as Array<Record<string, unknown>>).find((row) => Number(row.id) === id);
  },

  scores(filter: { studentId?: number; taskId?: number } = {}) {
    return trainingRepo.scores(filter);
  },

  grade(input: { studentId: number; taskId: number; score: number; feedback?: string }) {
    if (input.score < 0 || input.score > 100) {
      throw ApiError.badRequest('成绩必须在 0 ~ 100 之间');
    }
    if (!trainingRepo.findStudent(input.studentId)) {
      throw ApiError.notFound(`学员 ${input.studentId} 不存在`);
    }
    const task = trainingRepo.findTask(input.taskId);
    if (!task) {
      throw ApiError.notFound(`任务 ${input.taskId} 不存在`);
    }
    if (input.score > task.points) {
      throw ApiError.badRequest(`成绩不能超过任务满分 ${task.points}`);
    }
    const id = trainingRepo.upsertScore(input);
    return trainingRepo.scores({ studentId: input.studentId }).find((row) => Number((row as Record<string, unknown>).id) === id);
  },
};

export const auditService = {
  list(filter: { username?: string; resource?: string; action?: string; limit?: number }) {
    return auditRepo.list(filter);
  },

  statistics() {
    const list = auditRepo.list({ limit: 1000 });
    return { total: list.length, byResource: auditRepo.statistics(), recent: list.length };
  },
};
