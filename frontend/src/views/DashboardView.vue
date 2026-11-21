<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { EChartsOption } from 'echarts';
import { ElMessage } from 'element-plus';
import { dashboardApi, type DashboardOverview } from '@/api';
import StatCard from '@/components/StatCard.vue';
import ChartBox from '@/components/ChartBox.vue';
import { useI18n } from '@/i18n';
import { formatMoney, statusText } from '@/utils/format';

const { t } = useI18n();
const loading = ref(false);
const days = ref(14);
const data = ref<DashboardOverview | null>(null);

async function load() {
  loading.value = true;
  try {
    data.value = await dashboardApi.overview(days.value);
  } catch {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const kpi = computed(() => data.value?.kpi);

const trendOption = computed<EChartsOption>(() => {
  const trend = data.value?.trend ?? [];
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: [t('gmvUnit'), t('ordersUnit')], right: 0, top: 0, icon: 'roundRect', itemHeight: 8 },
    grid: { left: 8, right: 8, top: 42, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: trend.map((item) => item.date.slice(5)),
      axisLine: { lineStyle: { color: '#e5e6eb' } },
      axisLabel: { color: '#86909c' },
    },
    yAxis: [
      { type: 'value', name: 'GMV', splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { color: '#86909c' } },
      { type: 'value', name: t('ordersUnit'), splitLine: { show: false }, axisLabel: { color: '#86909c' } },
    ],
    series: [
      {
        name: t('gmvUnit'),
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: trend.map((item) => item.gmv_yuan),
        itemStyle: { color: '#fe2c55' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(254,44,85,0.28)' },
              { offset: 1, color: 'rgba(254,44,85,0.02)' },
            ],
          },
        },
      },
      {
        name: t('ordersUnit'),
        type: 'bar',
        yAxisIndex: 1,
        barWidth: 12,
        data: trend.map((item) => item.order_count),
        itemStyle: { color: 'rgba(37,244,238,0.55)', borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
});

const siteShareOption = computed<EChartsOption>(() => {
  const rows = data.value?.siteShare ?? [];
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, icon: 'circle', itemHeight: 8 },
    series: [
      {
        type: 'pie',
        radius: ['46%', '70%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}\n{d}%', color: '#4e5969', fontSize: 12 },
        data: rows.map((row) => ({ name: row.region_label, value: row.gmv_cent / 100 })),
        color: ['#fe2c55', '#25f4ee', '#ff9f43', '#7c5cff'],
      },
    ],
  };
});

const topProductsOption = computed<EChartsOption>(() => {
  const rows = [...(data.value?.topProducts ?? [])].reverse();
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f2f3f5' } }, axisLabel: { color: '#86909c' } },
    yAxis: {
      type: 'category',
      data: rows.map((row) => row.sku),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#4e5969' },
    },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        data: rows.map((row) => row.gmv_yuan),
        itemStyle: { borderRadius: [0, 6, 6, 0], color: '#fe2c55' },
        label: { show: true, position: 'right', color: '#86909c', fontSize: 11, formatter: '¥{c}' },
      },
    ],
  };
});

const statusOption = computed<EChartsOption>(() => {
  const rows = data.value?.statusDistribution ?? [];
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, icon: 'circle', itemHeight: 8 },
    series: [
      {
        type: 'pie',
        radius: '62%',
        center: ['50%', '44%'],
        data: rows.map((row) => ({ name: statusText(row.status), value: row.c })),
        label: { formatter: '{b} {c}', fontSize: 11, color: '#4e5969' },
        color: ['#fe2c55', '#25f4ee', '#ff9f43', '#7c5cff', '#00b42a', '#86909c', '#c9cdd4'],
      },
    ],
  };
});

const liveRoiRows = computed(() => data.value?.liveRoi ?? []);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuOverview') }}</h2>
        <div class="sub">{{ t('appSubtitle') }}</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-radio-group v-model="days" size="small" @change="load">
          <el-radio-button :value="7">{{ t('days7') }}</el-radio-button>
          <el-radio-button :value="14">{{ t('days14') }}</el-radio-button>
          <el-radio-button :value="30">{{ t('days30') }}</el-radio-button>
        </el-radio-group>
        <el-button size="small" :loading="loading" @click="load">{{ t('refresh') }}</el-button>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 16px">
      <StatCard :label="t('kpiGmv')" :value="formatMoney(kpi?.gmv_yuan)" accent :hint="`${t('days')} ${days}`" />
      <StatCard :label="t('kpiOrders')" :value="kpi?.order_count ?? 0" :hint="`AOV ¥${kpi?.aov_yuan ?? 0}`" />
      <StatCard :label="t('kpiAov')" :value="formatMoney(kpi?.aov_yuan)" />
      <StatCard
        :label="t('kpiRefundRate')"
        :value="`${kpi?.refund_rate ?? 0}%`"
        :hint="`${t('kpiRefund')} ${formatMoney(kpi?.refund_yuan)}`"
        :trend="(kpi?.refund_rate ?? 0) > 3 ? 'down' : 'up'"
      />
    </div>

    <div class="grid grid-4" style="margin-bottom: 16px">
      <StatCard :label="t('kpiLiveGmv')" :value="formatMoney(kpi?.live_gmv_yuan)" />
      <StatCard :label="t('kpiLiveRatio')" :value="`${kpi?.live_gmv_ratio ?? 0}%`" />
      <StatCard :label="t('kpiCommissionPending')" :value="formatMoney(kpi?.commission_pending_yuan)" />
      <StatCard
        :label="t('todoTitle')"
        :value="(data?.todo.overdue_shipment ?? 0) + (data?.todo.exception_logistics ?? 0) + (data?.todo.low_stock ?? 0)"
        :hint="`${t('todoLowStock')} ${data?.todo.low_stock ?? 0} · ${t('todoOverdue')} ${data?.todo.overdue_shipment ?? 0}`"
      />
    </div>

    <div class="grid grid-3" style="margin-bottom: 16px">
      <div class="card" style="grid-column: span 2">
        <div class="card-title">
          <span>{{ t('trendTitle') }}</span>
          <span class="muted">{{ t('refreshedAt') }} {{ data?.generated_at?.replace('T', ' ').slice(0, 19) }}</span>
        </div>
        <ChartBox :option="trendOption" :height="320" />
      </div>
      <div class="card">
        <div class="card-title">{{ t('siteShareTitle') }}</div>
        <ChartBox :option="siteShareOption" :height="320" />
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom: 16px">
      <div class="card">
        <div class="card-title">{{ t('topProductsTitle') }}</div>
        <ChartBox :option="topProductsOption" :height="280" />
      </div>
      <div class="card">
        <div class="card-title">{{ t('statusDistributionTitle') }}</div>
        <ChartBox :option="statusOption" :height="280" />
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">{{ t('shopPerformanceTitle') }}</div>
        <el-table :data="data?.shops ?? []" size="small" stripe>
          <el-table-column prop="shop_name" :label="t('orderShop')" min-width="150" />
          <el-table-column prop="region" :label="t('influencerRegion')" width="90" />
          <el-table-column :label="t('gmvUnit')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.gmv_yuan) }}</template>
          </el-table-column>
          <el-table-column prop="order_count" :label="t('ordersUnit')" width="90" align="right" />
          <el-table-column prop="pending_count" :label="t('todoOverdue')" width="110" align="right" />
        </el-table>
      </div>

      <div class="card">
        <div class="card-title">
          <span>{{ t('liveRoiTitle') }}</span>
          <el-button text size="small" @click="$router.push('/live')">{{ t('more') }}</el-button>
        </div>
        <el-table :data="liveRoiRows" size="small" stripe>
          <el-table-column prop="title" :label="t('liveTitle')" min-width="160" show-overflow-tooltip />
          <el-table-column :label="t('liveActualGmv')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney((row.actual_gmv_cent ?? 0) / 100) }}</template>
          </el-table-column>
          <el-table-column :label="t('liveGmvTarget')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney((row.gmv_target_cent ?? 0) / 100) }}</template>
          </el-table-column>
          <el-table-column :label="t('influencerRoi')" width="100" align="right">
            <template #default="{ row }">
              <el-tag size="small" :type="(row.roi ?? 0) >= 1 ? 'success' : 'warning'" effect="plain">
                {{ row.roi === null ? '-' : row.roi }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>
