<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { dashboardApi, type AuditLog } from '@/api';
import { useI18n } from '@/i18n';
import { formatDateTime } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const rows = ref<AuditLog[]>([]);
const statistics = ref<{ total: number; byResource: Array<{ resource: string; c: number }>; recent: number }>({
  total: 0,
  byResource: [],
  recent: 0,
});

const username = ref('');
const resource = ref('');
const action = ref('');

const resourceOptions = ['inventory', 'orders', 'products', 'settlements', 'live-sessions', 'affiliates', 'training', 'shops', 'auth'];

async function load() {
  loading.value = true;
  try {
    rows.value = await dashboardApi.auditLogs({
      username: username.value || undefined,
      resource: resource.value || undefined,
      action: action.value || undefined,
      limit: 100,
    });
    statistics.value = await dashboardApi.auditStatistics();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const maxResource = computed(() => Math.max(1, ...statistics.value.byResource.map((item) => Number(item.c))));

function barWidth(count: number) {
  return `${Math.round((Number(count) / maxResource.value) * 100)}%`;
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuLogs') }}</h2>
        <div class="sub">{{ t('logsSubtitle') }}</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-button size="small" @click="load">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom: 16px">
      <div class="card">
        <div class="card-title">{{ t('logsTotal') }}</div>
        <div class="value" style="font-size: 30px; font-weight: 700">{{ statistics.total }}</div>
        <div class="muted">{{ t('logsRecent') }}: {{ statistics.recent }}</div>
      </div>
      <div class="card" style="grid-column: span 2">
        <div class="card-title">{{ t('logsByResource') }}</div>
        <div v-for="item in statistics.byResource" :key="item.resource" class="resource-bar">
          <span class="resource-name">{{ item.resource }}</span>
          <div class="resource-track">
            <div class="resource-fill" :style="{ width: barWidth(item.c) }"></div>
          </div>
          <span class="resource-count">{{ item.c }}</span>
        </div>
        <el-empty v-if="!statistics.byResource.length" :description="t('empty')" :image-size="60" />
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <el-input v-model="username" :placeholder="t('logsUsername')" clearable style="width: 180px" @keyup.enter="load" />
        <el-select v-model="resource" clearable :placeholder="t('logsResource')" style="width: 180px" @change="load">
          <el-option v-for="item in resourceOptions" :key="item" :value="item" :label="item" />
        </el-select>
        <el-input v-model="action" :placeholder="`${t('logsAction')} (POST / PATCH)`" clearable style="width: 200px" @keyup.enter="load" />
        <el-button type="primary" @click="load">{{ t('search') }}</el-button>
      </div>

      <el-table :data="rows" size="small" stripe>
        <el-table-column :label="t('createdAt')" width="170">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="username" :label="t('logsUsername')" width="120" />
        <el-table-column prop="action" :label="t('logsAction')" width="150" />
        <el-table-column prop="resource" :label="t('logsResource')" width="140" />
        <el-table-column prop="resource_id" :label="t('logsResourceId')" width="110" align="right" />
        <el-table-column prop="method" :label="t('logsMethod')" width="90" />
        <el-table-column prop="path" :label="t('logsPath')" min-width="240" show-overflow-tooltip />
        <el-table-column prop="ip" :label="t('logsIp')" width="130" />
        <el-table-column prop="detail" :label="t('logsDetail')" min-width="220" show-overflow-tooltip />
      </el-table>
      <el-empty v-if="!rows.length" :description="t('empty')" :image-size="80" />
    </div>
  </div>
</template>

<style scoped>
.resource-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.resource-name {
  width: 120px;
  color: #4e5969;
  font-size: 13px;
}
.resource-track {
  flex: 1;
  height: 10px;
  background: #f2f3f5;
  border-radius: 6px;
  overflow: hidden;
}
.resource-fill {
  height: 100%;
  background: linear-gradient(90deg, #fe2c55, #ff7a94);
  border-radius: 6px;
  transition: width 0.4s ease;
}
.resource-count {
  width: 44px;
  text-align: right;
  color: #86909c;
  font-size: 13px;
}
</style>
