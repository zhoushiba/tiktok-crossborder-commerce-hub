import { getDb } from '../db';

export const trainingRepo = {
  students() {
    return getDb()
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(1) FROM training_score sc WHERE sc.student_id = s.id) AS graded_count,
                (SELECT ROUND(AVG(sc.score), 1) FROM training_score sc WHERE sc.student_id = s.id) AS avg_score
           FROM training_student s ORDER BY s.id`,
      )
      .all();
  },

  findStudent(id: number) {
    return getDb().prepare('SELECT * FROM training_student WHERE id = ?').get(id);
  },

  createStudent(input: { name: string; school: string; major?: string; phone?: string }) {
    const info = getDb()
      .prepare('INSERT INTO training_student (name, school, major, phone) VALUES (?, ?, ?, ?)')
      .run(input.name, input.school, input.major ?? null, input.phone ?? null);
    return Number(info.lastInsertRowid);
  },

  tasks() {
    return getDb()
      .prepare(
        `SELECT t.*,
                (SELECT COUNT(1) FROM training_score sc WHERE sc.task_id = t.id) AS graded_count,
                (SELECT ROUND(AVG(sc.score), 1) FROM training_score sc WHERE sc.task_id = t.id) AS avg_score
           FROM training_task t ORDER BY t.id`,
      )
      .all();
  },

  findTask(id: number) {
    return getDb().prepare('SELECT * FROM training_task WHERE id = ?').get(id) as
      | { id: number; title: string; points: number }
      | undefined;
  },

  createTask(input: { title: string; description?: string; points?: number; dueDate?: string }) {
    const info = getDb()
      .prepare('INSERT INTO training_task (title, description, points, due_date) VALUES (?, ?, ?, ?)')
      .run(input.title, input.description ?? null, input.points ?? 100, input.dueDate ?? null);
    return Number(info.lastInsertRowid);
  },

  scores(filter: { studentId?: number; taskId?: number } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.studentId) {
      clauses.push('sc.student_id = ?');
      params.push(filter.studentId);
    }
    if (filter.taskId) {
      clauses.push('sc.task_id = ?');
      params.push(filter.taskId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
      .prepare(
        `SELECT sc.*, s.name AS student_name, t.title AS task_title, t.points
           FROM training_score sc
           JOIN training_student s ON s.id = sc.student_id
           JOIN training_task t ON t.id = sc.task_id
           ${where} ORDER BY sc.id`,
      )
      .all(...params);
  },

  upsertScore(input: { studentId: number; taskId: number; score: number; feedback?: string }) {
    const db = getDb();
    const existing = db
      .prepare('SELECT id FROM training_score WHERE student_id = ? AND task_id = ?')
      .get(input.studentId, input.taskId) as { id: number } | undefined;
    if (existing) {
      db.prepare("UPDATE training_score SET score = ?, feedback = ?, graded_at = datetime('now') WHERE id = ?").run(
        input.score,
        input.feedback ?? null,
        existing.id,
      );
      return existing.id;
    }
    const info = db
      .prepare('INSERT INTO training_score (student_id, task_id, score, feedback) VALUES (?, ?, ?, ?)')
      .run(input.studentId, input.taskId, input.score, input.feedback ?? null);
    return Number(info.lastInsertRowid);
  },

  statistics() {
    return getDb()
      .prepare(
        `SELECT
           (SELECT COUNT(1) FROM training_student) AS student_count,
           (SELECT COUNT(1) FROM training_task) AS task_count,
           (SELECT COUNT(1) FROM training_score) AS score_count,
           (SELECT ROUND(AVG(score), 1) FROM training_score) AS avg_score,
           (SELECT ROUND(MAX(sc.score) * 100.0 / MAX(t.points), 1)
              FROM training_score sc JOIN training_task t ON t.id = sc.task_id) AS best_ratio`,
      )
      .get();
  },
};

export const auditRepo = {
  list(filter: { username?: string; resource?: string; action?: string; limit?: number } = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.username) {
      clauses.push('username LIKE ?');
      params.push(`%${filter.username}%`);
    }
    if (filter.resource) {
      clauses.push('resource = ?');
      params.push(filter.resource);
    }
    if (filter.action) {
      clauses.push('action LIKE ?');
      params.push(`%${filter.action}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return getDb()
      .prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params, filter.limit ?? 100);
  },

  create(input: {
    userId?: number | null;
    username?: string | null;
    action: string;
    resource: string;
    resourceId?: string | null;
    detail?: string | null;
    ip?: string | null;
    method?: string | null;
    path?: string | null;
  }) {
    getDb()
      .prepare(
        `INSERT INTO audit_log (user_id, username, action, resource, resource_id, method, path, ip, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.userId ?? null,
        input.username ?? 'anonymous',
        input.action,
        input.resource,
        input.resourceId ?? null,
        input.method ?? null,
        input.path ?? null,
        input.ip ?? null,
        input.detail ?? null,
      );
  },

  statistics(): Array<{ resource: string; c: number }> {
    return getDb().prepare('SELECT resource, COUNT(1) AS c FROM audit_log GROUP BY resource ORDER BY c DESC').all() as Array<{
      resource: string;
      c: number;
    }>;
  },
};
