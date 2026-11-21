<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { trainingApi } from '@/api';
import { useI18n } from '@/i18n';
import { formatDateTime, percent, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

type Row = Record<string, unknown>;

const loading = ref(false);
const tab = ref('students');
const statistics = ref({ student_count: 0, task_count: 0, score_count: 0, avg_score: 0, best_ratio: 0 });
const passRate = ref(0);
const students = ref<Row[]>([]);
const tasks = ref<Row[]>([]);
const scores = ref<Row[]>([]);

const studentVisible = ref(false);
const studentForm = reactive({ name: '', school: '四川迅霆跨境电商学院', major: '跨境电子商务', phone: '' });

const taskVisible = ref(false);
const taskForm = reactive({ title: '', description: '', points: 100, dueDate: '' });

const gradeVisible = ref(false);
const gradeForm = reactive({ studentId: 0, taskId: 0, score: 85, feedback: '' });

const completion = computed(() => {
  const total = students.value.length * tasks.value.length;
  if (!total) return 0;
  return Math.round((scores.value.length / total) * 100);
});

function defaultDue() {
  const date = new Date(Date.now() + 7 * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function load() {
  loading.value = true;
  try {
    const overview = await trainingApi.overview();
    statistics.value = overview.statistics;
    passRate.value = overview.passRate;
    students.value = overview.students ?? [];
    tasks.value = overview.tasks ?? [];
    scores.value = await trainingApi.scores();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function openStudent() {
  studentForm.name = '';
  studentForm.school = '四川迅霆跨境电商学院';
  studentForm.major = '跨境电子商务';
  studentForm.phone = '';
  studentVisible.value = true;
}

async function submitStudent() {
  await trainingApi.createStudent({
    name: studentForm.name,
    school: studentForm.school,
    major: studentForm.major || undefined,
    phone: studentForm.phone || undefined,
  });
  studentVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

function openTask() {
  taskForm.title = '';
  taskForm.description = '';
  taskForm.points = 100;
  taskForm.dueDate = defaultDue();
  taskVisible.value = true;
}

async function submitTask() {
  await trainingApi.createTask({
    title: taskForm.title,
    description: taskForm.description || undefined,
    points: taskForm.points,
    dueDate: taskForm.dueDate || undefined,
  });
  taskVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

function openGrade(studentId: number) {
  gradeForm.studentId = studentId;
  gradeForm.taskId = Number(tasks.value[0]?.id ?? 0);
  gradeForm.score = 85;
  gradeForm.feedback = '';
  gradeVisible.value = true;
}

async function submitGrade() {
  await trainingApi.grade({
    studentId: gradeForm.studentId,
    taskId: gradeForm.taskId,
    score: gradeForm.score,
    feedback: gradeForm.feedback || undefined,
  });
  gradeVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

const scoreType = (score: number, points: number) => {
  const ratio = points ? score / points : 0;
  return ratio >= 0.85 ? 'success' : ratio >= 0.6 ? 'warning' : 'danger';
};
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuTraining') }}</h2>
        <div class="sub">{{ t('trainingSubtitle') }}</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-button size="small" @click="openTask">{{ t('trainingCreateTask') }}</el-button>
        <el-button size="small" type="primary" @click="openStudent">{{ t('trainingCreateStudent') }}</el-button>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 16px">
      <div class="card kpi"><span class="label">{{ t('trainingStudents') }}</span><span class="value">{{ statistics.student_count }}</span></div>
      <div class="card kpi"><span class="label">{{ t('trainingTasks') }}</span><span class="value">{{ statistics.task_count }}</span></div>
      <div class="card kpi"><span class="label">{{ t('trainingAvgScore') }}</span><span class="value">{{ Number(statistics.avg_score).toFixed(1) }}</span></div>
      <div class="card kpi"><span class="label">{{ t('trainingPassRate') }}</span><span class="value">{{ percent(passRate) }}</span></div>
    </div>

    <div class="card">
      <el-tabs v-model="tab">
        <el-tab-pane :label="t('trainingStudents')" name="students">
          <div class="toolbar">
            <span class="muted">{{ t('trainingCompletion') }}: {{ completion }}% · {{ t('trainingScoreCount') }} {{ statistics.score_count }}</span>
          </div>
          <el-table :data="students" size="small" stripe>
            <el-table-column prop="name" :label="t('trainingStudentName')" width="130" />
            <el-table-column prop="school" :label="t('trainingSchool')" min-width="200" show-overflow-tooltip />
            <el-table-column prop="major" :label="t('trainingMajor')" width="160" />
            <el-table-column prop="phone" :label="t('trainingPhone')" width="140" />
            <el-table-column prop="graded_count" :label="t('trainingGraded')" width="100" align="right" />
            <el-table-column :label="t('trainingAvgScore')" width="120" align="right">
              <template #default="{ row }">{{ row.avg_score === null ? '-' : Number(row.avg_score).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column :label="t('status')" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="130" fixed="right">
              <template #default="{ row }">
                <el-button text size="small" type="primary" @click="openGrade(Number(row.id))">{{ t('trainingGrade') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="t('trainingTasks')" name="tasks">
          <el-table :data="tasks" size="small" stripe>
            <el-table-column prop="title" :label="t('trainingTaskTitle')" min-width="220" show-overflow-tooltip />
            <el-table-column prop="points" :label="t('trainingPoints')" width="100" align="right" />
            <el-table-column prop="due_date" :label="t('trainingDueDate')" width="140" />
            <el-table-column prop="graded_count" :label="t('trainingGraded')" width="110" align="right" />
            <el-table-column :label="t('trainingAvgScore')" width="120" align="right">
              <template #default="{ row }">{{ row.avg_score === null ? '-' : Number(row.avg_score).toFixed(1) }}</template>
            </el-table-column>
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="t('trainingScores')" name="scores">
          <el-table :data="scores" size="small" stripe>
            <el-table-column prop="student_name" :label="t('trainingStudentName')" width="130" />
            <el-table-column prop="task_title" :label="t('trainingTaskTitle')" min-width="220" show-overflow-tooltip />
            <el-table-column :label="t('trainingScore')" width="120" align="right">
              <template #default="{ row }">
                <el-tag size="small" :type="scoreType(Number(row.score), Number(row.points))" effect="plain">
                  {{ row.score }} / {{ row.points }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="feedback" :label="t('trainingFeedback')" min-width="200" show-overflow-tooltip />
            <el-table-column :label="t('gradedAt')" width="170">
              <template #default="{ row }">{{ formatDateTime(row.graded_at) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="studentVisible" :title="t('trainingCreateStudent')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('trainingStudentName')"><el-input v-model="studentForm.name" /></el-form-item>
        <el-form-item :label="t('trainingSchool')"><el-input v-model="studentForm.school" /></el-form-item>
        <el-form-item :label="t('trainingMajor')"><el-input v-model="studentForm.major" /></el-form-item>
        <el-form-item :label="t('trainingPhone')"><el-input v-model="studentForm.phone" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="studentVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitStudent">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskVisible" :title="t('trainingCreateTask')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('trainingTaskTitle')"><el-input v-model="taskForm.title" /></el-form-item>
        <el-form-item :label="t('remark')"><el-input v-model="taskForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item :label="t('trainingPoints')"><el-input-number v-model="taskForm.points" :min="1" :max="100" style="width: 100%" /></el-form-item>
        <el-form-item :label="t('trainingDueDate')"><el-input v-model="taskForm.dueDate" placeholder="2026-12-01" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitTask">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="gradeVisible" :title="t('trainingGrade')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('trainingTaskTitle')">
          <el-select v-model="gradeForm.taskId" style="width: 100%">
            <el-option v-for="task in tasks" :key="String(task.id)" :value="Number(task.id)" :label="String(task.title)" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('trainingScore')">
          <el-input-number v-model="gradeForm.score" :min="0" :max="100" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('trainingFeedback')">
          <el-input v-model="gradeForm.feedback" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gradeVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitGrade">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
