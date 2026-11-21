<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { affiliateApi, productApi, type Commission, type Influencer, type Product } from '@/api';
import { useI18n } from '@/i18n';
import { formatDateTime, formatMoney, formatNumber, percent, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const influencers = ref<Influencer[]>([]);
const commissions = ref<Commission[]>([]);
const products = ref<Product[]>([]);
const tab = ref('influencers');
const region = ref('');
const commissionStatus = ref('');

const createVisible = ref(false);
const createForm = reactive({
  nickname: '',
  handle: '@',
  region: 'US',
  followers: 100000,
  category: 'Beauty',
  commissionRate: 0.1,
});

const linkVisible = ref(false);
const linkForm = reactive({ influencerId: 0, productId: 0, utmCampaign: 'blackfriday' });

const detailVisible = ref(false);
const detail = ref<(Influencer & { links: Array<Record<string, unknown>>; summary: Record<string, number> }) | null>(null);

const totals = computed(() => {
  const gmv = influencers.value.reduce((sum, item) => sum + Number(item.total_gmv_yuan ?? 0), 0);
  const pending = influencers.value.reduce((sum, item) => sum + Number(item.pending_commission_yuan ?? 0), 0);
  return { gmv, pending, count: influencers.value.length };
});

async function loadInfluencers() {
  loading.value = true;
  try {
    influencers.value = await affiliateApi.list({ region: region.value || undefined });
  } finally {
    loading.value = false;
  }
}

async function loadCommissions() {
  loading.value = true;
  try {
    commissions.value = await affiliateApi.commissions({ status: commissionStatus.value || undefined });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadInfluencers(), loadCommissions()]);
  products.value = (await productApi.list({ page: 1, pageSize: 50 })).list;
});

function openCreate() {
  createForm.nickname = '';
  createForm.handle = '@';
  createForm.region = 'US';
  createForm.followers = 100000;
  createForm.category = 'Beauty';
  createForm.commissionRate = 0.1;
  createVisible.value = true;
}

async function submitCreate() {
  await affiliateApi.create({
    nickname: createForm.nickname,
    handle: createForm.handle,
    region: createForm.region,
    followers: createForm.followers,
    category: createForm.category,
    commissionRate: createForm.commissionRate,
  });
  createVisible.value = false;
  ElMessage.success(t('success'));
  await loadInfluencers();
}

function openLink(row: Influencer) {
  linkForm.influencerId = row.id;
  linkForm.productId = products.value[0]?.id ?? 0;
  linkForm.utmCampaign = 'blackfriday';
  linkVisible.value = true;
}

async function submitLink() {
  await affiliateApi.createLink({
    influencerId: linkForm.influencerId,
    productId: linkForm.productId,
    utmCampaign: linkForm.utmCampaign,
  });
  linkVisible.value = false;
  ElMessage.success(t('success'));
  await loadInfluencers();
}

async function openDetail(row: Influencer) {
  detailVisible.value = true;
  detail.value = await affiliateApi.detail(row.id);
}

async function accrue(orderId: number) {
  const result = await affiliateApi.accrue(orderId);
  ElMessage.success(`${t('affiliateAccrue')} ${result.created.length} · ${formatMoney(result.totalYuan)}`);
  await loadCommissions();
  await loadInfluencers();
}

function commissionStatusTag(status: string) {
  return statusType(status);
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuAffiliates') }}</h2>
        <div class="sub">{{ t('affiliateSubtitle') }}</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-button size="small" type="primary" @click="openCreate">{{ t('affiliateCreate') }}</el-button>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 16px">
      <div class="card kpi"><span class="label">{{ t('affiliateCount') }}</span><span class="value">{{ totals.count }}</span></div>
      <div class="card kpi"><span class="label">{{ t('affiliateGmv') }}</span><span class="value">{{ formatMoney(totals.gmv) }}</span></div>
      <div class="card kpi"><span class="label">{{ t('affiliatePending') }}</span><span class="value">{{ formatMoney(totals.pending) }}</span></div>
      <div class="card kpi"><span class="label">{{ t('commissionCount') }}</span><span class="value">{{ commissions.length }}</span></div>
    </div>

    <div class="card">
      <el-tabs v-model="tab">
        <el-tab-pane :label="t('affiliateList')" name="influencers">
          <div class="toolbar">
            <el-select v-model="region" clearable :placeholder="t('affiliateRegion')" style="width: 150px" @change="loadInfluencers">
              <el-option value="US" :label="t('regionUs')" />
              <el-option value="UK" :label="t('regionUk')" />
              <el-option value="SEA" :label="t('regionSea')" />
            </el-select>
            <span class="muted">{{ t('affiliateHandle') }} 需以 @ 开头</span>
          </div>
          <el-table :data="influencers" size="small" stripe>
            <el-table-column prop="nickname" :label="t('affiliateNickname')" min-width="150" />
            <el-table-column prop="handle" :label="t('affiliateHandle')" width="170" />
            <el-table-column :label="t('affiliateRegion')" width="110">
              <template #default="{ row }">
                {{ row.region === 'US' ? t('regionUs') : row.region === 'UK' ? t('regionUk') : t('regionSea') }}
              </template>
            </el-table-column>
            <el-table-column :label="t('affiliateFollowers')" width="120" align="right">
              <template #default="{ row }">{{ formatNumber(row.followers) }}</template>
            </el-table-column>
            <el-table-column :label="t('affiliateRate')" width="100" align="right">
              <template #default="{ row }">{{ percent(Number(row.commission_rate) * 100) }}</template>
            </el-table-column>
            <el-table-column :label="t('affiliateGmv')" width="130" align="right">
              <template #default="{ row }">{{ formatMoney(row.total_gmv_yuan) }}</template>
            </el-table-column>
            <el-table-column :label="t('affiliatePending')" width="130" align="right">
              <template #default="{ row }">{{ formatMoney(row.pending_commission_yuan) }}</template>
            </el-table-column>
            <el-table-column :label="t('affiliateRoi')" width="100" align="right">
              <template #default="{ row }">{{ row.roi === null ? '-' : Number(row.roi).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column :label="t('status')" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="180" fixed="right">
              <template #default="{ row }">
                <el-button text size="small" @click="openDetail(row)">{{ t('detail') }}</el-button>
                <el-button text size="small" type="primary" @click="openLink(row)">{{ t('affiliateLinkCreate') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="t('commissionList')" name="commissions">
          <div class="toolbar">
            <el-select v-model="commissionStatus" clearable :placeholder="t('status')" style="width: 150px" @change="loadCommissions">
              <el-option v-for="item in ['PENDING', 'CONFIRMED', 'SETTLED']" :key="item" :value="item" :label="statusText(item)" />
            </el-select>
            <span class="muted">{{ t('commissionRule') }}: 仅 DELIVERED 订单可计提</span>
          </div>
          <el-table :data="commissions" size="small" stripe>
            <el-table-column prop="platform_order_id" :label="t('orderNo')" width="190" />
            <el-table-column prop="nickname" :label="t('affiliateNickname')" width="150" />
            <el-table-column :label="t('affiliateGmv')" width="130" align="right">
              <template #default="{ row }">{{ formatMoney(Number(row.gmv_cent) / 100) }} {{ row.currency_code }}</template>
            </el-table-column>
            <el-table-column :label="t('affiliateRate')" width="100" align="right">
              <template #default="{ row }">{{ percent(Number(row.commission_rate) * 100) }}</template>
            </el-table-column>
            <el-table-column :label="t('commissionAmount')" width="130" align="right">
              <template #default="{ row }">{{ formatMoney(Number(row.commission_amount_cent) / 100) }}</template>
            </el-table-column>
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="commissionStatusTag(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('createdAt')" width="170">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="140" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.status === 'PENDING'" text size="small" type="primary" @click="accrue(Number(row.order_id))">
                  {{ t('affiliateAccrue') }}
                </el-button>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="createVisible" :title="t('affiliateCreate')" width="520px">
      <el-form label-position="top">
        <el-form-item :label="t('affiliateNickname')"><el-input v-model="createForm.nickname" /></el-form-item>
        <el-form-item :label="`${t('affiliateHandle')} (@xxx)`"><el-input v-model="createForm.handle" /></el-form-item>
        <el-form-item :label="t('affiliateRegion')">
          <el-select v-model="createForm.region" style="width: 100%">
            <el-option value="US" :label="t('regionUs')" />
            <el-option value="UK" :label="t('regionUk')" />
            <el-option value="SEA" :label="t('regionSea')" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('affiliateCategory')"><el-input v-model="createForm.category" /></el-form-item>
        <el-form-item :label="t('affiliateFollowers')"><el-input-number v-model="createForm.followers" :min="0" :step="10000" style="width: 100%" /></el-form-item>
        <el-form-item :label="t('affiliateRate')">
          <el-input-number v-model="createForm.commissionRate" :min="0" :max="0.5" :step="0.01" :precision="2" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitCreate">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="linkVisible" :title="t('affiliateLinkCreate')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('productTitle')">
          <el-select v-model="linkForm.productId" filterable style="width: 100%">
            <el-option v-for="product in products" :key="product.id" :value="product.id" :label="`${product.sku} · ${product.title}`" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('affiliateCampaign')"><el-input v-model="linkForm.utmCampaign" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="linkVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitLink">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="detail?.nickname ?? t('detail')" size="620px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('affiliateHandle')">{{ detail.handle }}</el-descriptions-item>
          <el-descriptions-item :label="t('affiliateRegion')">{{ detail.region }}</el-descriptions-item>
          <el-descriptions-item :label="t('affiliateFollowers')">{{ formatNumber(detail.followers) }}</el-descriptions-item>
          <el-descriptions-item :label="t('affiliateRate')">{{ percent(Number(detail.commission_rate) * 100) }}</el-descriptions-item>
          <el-descriptions-item :label="t('affiliateGmv')">{{ formatMoney(detail.total_gmv_yuan) }}</el-descriptions-item>
          <el-descriptions-item :label="t('affiliatePending')">{{ formatMoney(detail.pending_commission_yuan) }}</el-descriptions-item>
        </el-descriptions>
        <div class="card-title" style="margin-top: 20px">{{ t('affiliateLinks') }}</div>
        <el-table :data="detail.links" size="small">
          <el-table-column prop="link_code" :label="t('affiliateLinkCode')" width="170" />
          <el-table-column prop="product_title" :label="t('productTitle')" show-overflow-tooltip />
          <el-table-column prop="clicks" :label="t('affiliateClicks')" width="90" align="right" />
          <el-table-column prop="conversions" :label="t('affiliateConversions')" width="90" align="right" />
          <el-table-column :label="t('affiliateGmv')" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(Number(row.gmv_yuan ?? 0)) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>
