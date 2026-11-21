<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { affiliateApi, settlementApi, type Influencer } from '@/api';
import { useI18n } from '@/i18n';
import { formatDateTime, formatMoney, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const rows = ref<Array<Record<string, any>>>([]);
const influencers = ref<Influencer[]>([]);
const status = ref('');
const summary = ref<Record<string, unknown> | null>(null);

const createVisible = ref(false);
const createForm = reactive({ influencerId: 0, periodStart: '', periodEnd: '', remark: '' });

const detailVisible = ref(false);
const detail = ref<Record<string, any> | null>(null);

const kpi = computed(() => {
  const totalCommission = rows.value.reduce((sum, row) => sum + Number(row.commission_yuan ?? 0), 0);
  const totalGmv = rows.value.reduce((sum, row) => sum + Number(row.total_gmv_yuan ?? 0), 0);
  const paid = rows.value.filter((row) => row.status === 'PAID');
  return {
    count: rows.value.length,
    gmv: totalGmv,
    commission: totalCommission,
    paid: paid.reduce((sum, row) => sum + Number(row.commission_yuan ?? 0), 0),
  };
});

function defaultPeriod() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`,
    end: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

async function load() {
  loading.value = true;
  try {
    rows.value = await settlementApi.list({ status: status.value || undefined });
    summary.value = await settlementApi.summary();
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  influencers.value = await affiliateApi.list();
  await load();
});

function openCreate() {
  const period = defaultPeriod();
  createForm.influencerId = influencers.value[0]?.id ?? 0;
  createForm.periodStart = period.start;
  createForm.periodEnd = period.end;
  createForm.remark = '';
  createVisible.value = true;
}

async function submitCreate() {
  await settlementApi.create({
    influencerId: createForm.influencerId,
    periodStart: createForm.periodStart,
    periodEnd: createForm.periodEnd,
    remark: createForm.remark || undefined,
  });
  createVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

async function transition(row: Record<string, any>, status: string) {
  await settlementApi.updateStatus(row.id, status);
  ElMessage.success(t('success'));
  await load();
}

async function openDetail(row: Record<string, any>) {
  detailVisible.value = true;
  detail.value = await settlementApi.detail(row.id);
}

const nextStatus = (current: string): Array<{ value: string; label: string }> => {
  const map: Record<string, string[]> = {
    DRAFT: ['PENDING'],
    PENDING: ['APPROVED', 'DRAFT'],
    APPROVED: ['PAID'],
    PAID: [],
  };
  return (map[current] ?? []).map((item) => ({ value: item, label: statusText(item) }));
};
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuSettlements') }}</h2>
        <div class="sub">{{ t('settlementFlow') }}: DRAFT → PENDING → APPROVED → PAID</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-button size="small" type="primary" @click="openCreate">{{ t('settlementCreate') }}</el-button>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 16px">
      <div class="card kpi"><span class="label">{{ t('settlementCount') }}</span><span class="value">{{ kpi.count }}</span></div>
      <div class="card kpi"><span class="label">{{ t('settlementGmv') }}</span><span class="value">{{ formatMoney(kpi.gmv) }}</span></div>
      <div class="card kpi"><span class="label">{{ t('settlementCommission') }}</span><span class="value">{{ formatMoney(kpi.commission) }}</span></div>
      <div class="card kpi"><span class="label">{{ t('settlementPaid') }}</span><span class="value">{{ formatMoney(kpi.paid) }}</span></div>
    </div>

    <div class="card">
      <div class="toolbar">
        <el-select v-model="status" clearable :placeholder="t('status')" style="width: 160px" @change="load">
          <el-option v-for="item in ['DRAFT', 'PENDING', 'APPROVED', 'PAID']" :key="item" :value="item" :label="statusText(item)" />
        </el-select>
        <span class="muted">{{ t('settlementRule') }}</span>
      </div>

      <el-table :data="rows" size="small" stripe>
        <el-table-column prop="settlement_no" :label="t('settlementNo')" width="180" />
        <el-table-column prop="nickname" :label="t('affiliateNickname')" min-width="150" />
        <el-table-column :label="t('settlementPeriod')" width="200">
          <template #default="{ row }">{{ row.period_start }} ~ {{ row.period_end }}</template>
        </el-table-column>
        <el-table-column :label="t('settlementGmv')" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.total_gmv_yuan) }}</template>
        </el-table-column>
        <el-table-column :label="t('settlementCommission')" width="130" align="right">
          <template #default="{ row }">
            {{ formatMoney(row.commission_yuan) }} {{ row.currency_code }}
          </template>
        </el-table-column>
        <el-table-column :label="t('settlementBase')" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.base_amount_yuan) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('createdAt')" width="165">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="220" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="openDetail(row)">{{ t('detail') }}</el-button>
            <el-button
              v-for="item in nextStatus(row.status)"
              :key="item.value"
              text
              size="small"
              type="primary"
              @click="transition(row, item.value)"
            >
              {{ item.label }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="createVisible" :title="t('settlementCreate')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('affiliateNickname')">
          <el-select v-model="createForm.influencerId" style="width: 100%">
            <el-option v-for="item in influencers" :key="item.id" :value="item.id" :label="`${item.nickname} (${item.handle})`" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('settlementPeriodStart')"><el-input v-model="createForm.periodStart" placeholder="2026-11-01" /></el-form-item>
        <el-form-item :label="t('settlementPeriodEnd')"><el-input v-model="createForm.periodEnd" placeholder="2026-11-30" /></el-form-item>
        <el-form-item :label="t('remark')"><el-input v-model="createForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitCreate">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="detail?.settlement_no ?? t('detail')" size="620px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('affiliateNickname')">{{ detail.nickname }}</el-descriptions-item>
          <el-descriptions-item :label="t('status')">{{ statusText(detail.status) }}</el-descriptions-item>
          <el-descriptions-item :label="t('settlementPeriod')">{{ detail.period_start }} ~ {{ detail.period_end }}</el-descriptions-item>
          <el-descriptions-item :label="t('settlementCommission')">{{ formatMoney(detail.commission_yuan) }}</el-descriptions-item>
          <el-descriptions-item :label="t('settlementBase')">{{ formatMoney(detail.base_amount_yuan) }}</el-descriptions-item>
          <el-descriptions-item :label="t('paidAt')">{{ detail.paid_at ? formatDateTime(detail.paid_at) : '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="card-title" style="margin-top: 20px">{{ t('settlementItems') }}</div>
        <el-table :data="detail.items" size="small">
          <el-table-column prop="platform_order_id" :label="t('orderNo')" width="190" />
          <el-table-column prop="commission_id" :label="t('commissionNo')" width="120" />
          <el-table-column :label="t('commissionAmount')" width="130" align="right">
            <template #default="{ row }">{{ formatMoney(Number(row.amount_cent) / 100) }}</template>
          </el-table-column>
          <el-table-column :label="t('status')" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>
