<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import { ElMessage } from 'element-plus';
import { liveApi, shopApi, type LiveSession, type Shop } from '@/api';
import ChartBox from '@/components/ChartBox.vue';
import { useI18n } from '@/i18n';
import { formatDateTime, formatMoney, percent, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const sessions = ref<LiveSession[]>([]);
const shops = ref<Shop[]>([]);
const status = ref('');
const detailVisible = ref(false);
const detail = ref<(LiveSession & { metricSeries: Array<Record<string, number>> }) | null>(null);

const createVisible = ref(false);
const createForm = reactive({ shopId: 1, title: '黑五美妆专场', hostName: 'Ava', scheduledAt: '', durationMin: 120, gmvTargetYuan: 5000 });

const reviewVisible = ref(false);
const reviewForm = reactive({ id: 0, note: '' });

const metricVisible = ref(false);
const metricForm = reactive({ id: 0, onlineCount: 320, gmvYuan: 1200, orders: 18 });

const liveNow = computed(() => sessions.value.find((item) => item.status === 'LIVE') ?? null);
const upcoming = computed(() => sessions.value.filter((item) => item.status === 'PLANNED'));
const history = computed(() => sessions.value.filter((item) => ['ENDED', 'REVIEWED'].includes(item.status)));

async function load() {
  loading.value = true;
  try {
    sessions.value = await liveApi.list({ status: status.value || undefined });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  shops.value = await shopApi.list();
  await load();
});

function defaultSchedule() {
  const date = new Date(Date.now() + 2 * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 20:00:00`;
}

function openCreate() {
  createForm.scheduledAt = defaultSchedule();
  createVisible.value = true;
}

async function submitCreate() {
  await liveApi.create({
    shopId: createForm.shopId,
    title: createForm.title,
    hostName: createForm.hostName,
    scheduledAt: createForm.scheduledAt,
    durationMin: createForm.durationMin,
    gmvTargetYuan: createForm.gmvTargetYuan,
  });
  createVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

async function start(session: LiveSession) {
  await liveApi.transition(session.id, { status: 'LIVE' });
  ElMessage.success(t('success'));
  await load();
}

async function end(session: LiveSession) {
  await liveApi.transition(session.id, {
    status: 'ENDED',
    viewers: session.viewers + 3200,
    peakOnline: Math.max(session.peak_online, 820),
    ordersCount: session.orders_count + 36,
  });
  await load();
}

function openReview(session: LiveSession) {
  reviewForm.id = session.id;
  reviewForm.note = '';
  reviewVisible.value = true;
}

async function submitReview() {
  await liveApi.review(reviewForm.id, reviewForm.note);
  reviewVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

function openMetric(session: LiveSession) {
  metricForm.id = session.id;
  metricVisible.value = true;
}

async function submitMetric() {
  await liveApi.pushMetric(metricForm.id, {
    onlineCount: metricForm.onlineCount,
    gmvYuan: metricForm.gmvYuan,
    orders: metricForm.orders,
  });
  metricVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

async function openDetail(session: LiveSession) {
  detailVisible.value = true;
  detail.value = await liveApi.detail(session.id);
}

const metricOption = computed<EChartsOption>(() => {
  const series = detail.value?.metricSeries ?? [];
  return {
    tooltip: { trigger: 'axis' },
    legend: { right: 0, top: 0, icon: 'roundRect', itemHeight: 8 },
    grid: { left: 8, right: 8, top: 40, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: series.map((m) => String(m.metric_at ?? '').slice(11, 16)), axisLabel: { color: '#86909c' } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { color: '#86909c' } },
    series: [
      { name: t('liveOnlineCount'), type: 'line', smooth: true, data: series.map((m) => m.online_count), itemStyle: { color: '#fe2c55' } },
      { name: t('liveGmvNow'), type: 'bar', data: series.map((m) => Number(m.gmv_cent ?? 0) / 100), itemStyle: { color: 'rgba(37,244,238,0.6)' } },
    ],
  };
});
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuLive') }}</h2>
        <div class="sub">{{ t('liveStatusFlow') }}: PLANNED → LIVE → ENDED → REVIEWED</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-select v-model="status" clearable :placeholder="t('status')" style="width: 150px" @change="load">
          <el-option v-for="item in ['PLANNED', 'LIVE', 'ENDED', 'REVIEWED']" :key="item" :value="item" :label="statusText(item)" />
        </el-select>
        <el-button size="small" type="primary" @click="openCreate">{{ t('liveCreate') }}</el-button>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom: 16px">
      <div class="card" style="grid-column: span 2">
        <div class="card-title">
          <span>{{ liveNow ? t('currentLive') : t('noLiveSession') }}</span>
          <el-tag v-if="liveNow" type="danger" effect="dark" size="small">LIVE</el-tag>
        </div>
        <template v-if="liveNow">
          <h3 style="margin: 4px 0 6px">{{ liveNow.title }}</h3>
          <p class="muted" style="margin: 0 0 12px">
            {{ liveNow.shop_name }} · {{ liveNow.host_name }} · {{ t('liveScheduledAt') }} {{ formatDateTime(liveNow.scheduled_at) }}
          </p>
          <div class="grid grid-4">
            <div class="kpi"><span class="label">{{ t('liveActualGmv') }}</span><span class="value">{{ formatMoney(liveNow.actual_gmv_cent / 100) }}</span></div>
            <div class="kpi"><span class="label">{{ t('liveGmvTarget') }}</span><span class="value">{{ formatMoney(liveNow.gmv_target_cent / 100) }}</span></div>
            <div class="kpi"><span class="label">{{ t('liveAchievement') }}</span><span class="value">{{ percent(liveNow.achievement_rate) }}</span></div>
            <div class="kpi"><span class="label">{{ t('livePeakOnline') }}</span><span class="value">{{ liveNow.peak_online }}</span></div>
          </div>
          <div class="toolbar" style="margin: 16px 0 0">
            <el-button size="small" type="primary" @click="openMetric(liveNow)">{{ t('livePushMetric') }}</el-button>
            <el-button size="small" @click="end(liveNow)">{{ t('liveEnd') }}</el-button>
            <el-button size="small" text @click="openDetail(liveNow)">{{ t('detail') }}</el-button>
          </div>
        </template>
        <el-empty v-else :description="t('noLiveSession')" :image-size="80" />
      </div>

      <div class="card">
        <div class="card-title">{{ t('liveUpcoming') }}</div>
        <el-timeline v-if="upcoming.length">
          <el-timeline-item v-for="item in upcoming" :key="item.id" :timestamp="formatDateTime(item.scheduled_at)" placement="top">
            <div style="font-weight: 600">{{ item.title }}</div>
            <div class="muted">{{ item.host_name }} · {{ item.duration_min }} {{ t('minute') }}</div>
            <el-button size="small" text type="primary" @click="start(item)">{{ t('liveStart') }}</el-button>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else :description="t('empty')" :image-size="64" />
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <span>{{ t('liveHistory') }}</span>
        <span class="muted">{{ t('liveSessionsCount') }}: {{ sessions.length }}</span>
      </div>
      <el-table :data="sessions" size="small" stripe>
        <el-table-column prop="title" :label="t('liveTitle')" min-width="200" show-overflow-tooltip />
        <el-table-column prop="shop_name" :label="t('liveShop')" width="170" show-overflow-tooltip />
        <el-table-column prop="host_name" :label="t('liveHost')" width="110" />
        <el-table-column :label="t('liveScheduledAt')" width="165">
          <template #default="{ row }">{{ formatDateTime(row.scheduled_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('liveActualGmv')" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.actual_gmv_cent / 100) }}</template>
        </el-table-column>
        <el-table-column :label="t('liveGmvTarget')" width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.gmv_target_cent / 100) }}</template>
        </el-table-column>
        <el-table-column :label="t('liveAchievement')" width="110" align="right">
          <template #default="{ row }">
            <el-tag size="small" :type="row.on_track ? 'success' : 'warning'" effect="plain">{{ percent(row.achievement_rate) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('status')" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="openDetail(row)">{{ t('detail') }}</el-button>
            <el-button v-if="row.status === 'PLANNED'" text size="small" type="primary" @click="start(row)">{{ t('liveStart') }}</el-button>
            <el-button v-if="row.status === 'ENDED'" text size="small" type="warning" @click="openReview(row)">{{ t('liveReview') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="createVisible" :title="t('liveCreate')" width="520px">
      <el-form label-position="top">
        <el-form-item :label="t('liveShop')">
          <el-select v-model="createForm.shopId" style="width: 100%">
            <el-option v-for="shop in shops" :key="shop.id" :value="shop.id" :label="`${shop.shop_name} (${shop.region})`" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('liveTitle')"><el-input v-model="createForm.title" /></el-form-item>
        <el-form-item :label="t('liveHost')"><el-input v-model="createForm.hostName" /></el-form-item>
        <el-form-item :label="t('liveScheduledAt')"><el-input v-model="createForm.scheduledAt" placeholder="2026-11-28 20:00:00" /></el-form-item>
        <el-form-item :label="t('liveDuration')"><el-input-number v-model="createForm.durationMin" :min="15" :step="15" style="width: 100%" /></el-form-item>
        <el-form-item :label="`${t('liveGmvTarget')} (CNY)`"><el-input-number v-model="createForm.gmvTargetYuan" :min="0" :step="500" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitCreate">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reviewVisible" :title="t('liveReview')" width="460px">
      <el-form label-position="top">
        <el-form-item :label="t('liveReviewNote')">
          <el-input v-model="reviewForm.note" type="textarea" :rows="4" :placeholder="t('liveReviewPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitReview">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="metricVisible" :title="t('livePushMetric')" width="460px">
      <el-form label-position="top">
        <el-form-item :label="t('liveOnlineCount')"><el-input-number v-model="metricForm.onlineCount" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item :label="`${t('liveGmvNow')} (CNY)`"><el-input-number v-model="metricForm.gmvYuan" :min="0" style="width: 100%" /></el-form-item>
        <el-form-item :label="t('liveOrders')"><el-input-number v-model="metricForm.orders" :min="0" style="width: 100%" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="metricVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitMetric">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="detail?.title ?? t('detail')" size="640px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('liveShop')">{{ detail.shop_name }}</el-descriptions-item>
          <el-descriptions-item :label="t('liveHost')">{{ detail.host_name }}</el-descriptions-item>
          <el-descriptions-item :label="t('liveActualGmv')">{{ formatMoney(detail.actual_gmv_cent / 100) }}</el-descriptions-item>
          <el-descriptions-item :label="t('liveViewers')">{{ detail.viewers }}</el-descriptions-item>
          <el-descriptions-item :label="t('liveReviewNote')" :span="2">{{ detail.review_note || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="card-title" style="margin-top: 20px">{{ t('liveMetrics') }}</div>
        <ChartBox :option="metricOption" :height="280" />
      </template>
    </el-drawer>
  </div>
</template>
