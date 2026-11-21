<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { authApi, currencyApi, shopApi, systemApi, type Shop } from '@/api';
import { useI18n } from '@/i18n';
import { formatDateTime, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const tab = ref('shops');
const shops = ref<Shop[]>([]);
const rates = ref<Array<Record<string, unknown>>>([]);
const users = ref<Array<{ id: number; username: string; real_name: string; role: string; status: string }>>([]);
const configs = ref<Array<{ id: number; config_key: string; config_value: string; description: string }>>([]);
const health = ref<{ status: string; env: string; database: string; shopCount: number; mockGateway: string; uptimeSeconds: number } | null>(null);

const rateVisible = ref(false);
const rateForm = reactive({ baseCurrency: 'USD', quoteCurrency: 'CNY', rate: 7.12, effectiveDate: '' });

const userVisible = ref(false);
const userForm = reactive({ username: '', password: '', realName: '', role: 'OPERATOR', email: '' });

function today() {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function load() {
  loading.value = true;
  try {
    const [shopList, rateList, userList, configList, healthInfo] = await Promise.all([
      shopApi.list(),
      currencyApi.rates(),
      authApi.users().catch(() => []),
      systemApi.config().catch(() => []),
      systemApi.health(),
    ]);
    shops.value = shopList;
    rates.value = rateList;
    users.value = userList;
    configs.value = configList;
    health.value = healthInfo;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function authorize(shop: Shop) {
  await shopApi.authorize(shop.id);
  ElMessage.success(t('success'));
  await load();
}

async function toggleStatus(shop: Shop) {
  await shopApi.updateStatus(shop.id, shop.status === 'ACTIVE' ? 'EXPIRED' : 'ACTIVE');
  ElMessage.success(t('success'));
  await load();
}

function openRate() {
  rateForm.baseCurrency = 'USD';
  rateForm.quoteCurrency = 'CNY';
  rateForm.rate = 7.12;
  rateForm.effectiveDate = today();
  rateVisible.value = true;
}

async function submitRate() {
  await currencyApi.upsertRate({
    baseCurrency: rateForm.baseCurrency,
    quoteCurrency: rateForm.quoteCurrency,
    rate: rateForm.rate,
    effectiveDate: rateForm.effectiveDate,
  });
  rateVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

function openUser() {
  userForm.username = '';
  userForm.password = '';
  userForm.realName = '';
  userForm.role = 'OPERATOR';
  userForm.email = '';
  userVisible.value = true;
}

async function submitUser() {
  await authApi.createUser({
    username: userForm.username,
    password: userForm.password,
    realName: userForm.realName,
    role: userForm.role,
    email: userForm.email || undefined,
  });
  userVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuSettings') }}</h2>
        <div class="sub">{{ t('settingsSubtitle') }}</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-tag v-if="health" :type="health.status === 'UP' ? 'success' : 'danger'" effect="plain">
          {{ t('settingsHealth') }}: {{ health.status }}
        </el-tag>
        <el-tag v-if="health" type="info" effect="plain">mock: {{ health.mockGateway }}</el-tag>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 16px">
      <div class="card kpi"><span class="label">{{ t('settingsShops') }}</span><span class="value">{{ shops.length }}</span></div>
      <div class="card kpi"><span class="label">{{ t('settingsRates') }}</span><span class="value">{{ rates.length }}</span></div>
      <div class="card kpi"><span class="label">{{ t('settingsUsers') }}</span><span class="value">{{ users.length }}</span></div>
      <div class="card kpi"><span class="label">{{ t('settingsUptime') }}</span><span class="value">{{ health ? Math.floor(health.uptimeSeconds / 60) : 0 }}m</span></div>
    </div>

    <div class="card">
      <el-tabs v-model="tab">
        <el-tab-pane :label="t('settingsShops')" name="shops">
          <el-table :data="shops" size="small" stripe>
            <el-table-column prop="shop_name" :label="t('settingsShopName')" min-width="180" />
            <el-table-column prop="region" :label="t('affiliateRegion')" width="100" />
            <el-table-column prop="currency_code" :label="t('settingsCurrency')" width="100" />
            <el-table-column prop="timezone" :label="t('settingsTimezone')" width="170" />
            <el-table-column prop="app_key" :label="t('settingsAppKey')" width="160" />
            <el-table-column prop="app_secret" :label="t('settingsAppSecret')" width="130" />
            <el-table-column prop="site_count" :label="t('settingsSites')" width="90" align="right" />
            <el-table-column prop="order_count" :label="t('settingsOrders')" width="100" align="right" />
            <el-table-column :label="t('status')" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="190" fixed="right">
              <template #default="{ row }">
                <el-button text size="small" type="primary" @click="authorize(row)">{{ t('settingsAuthorize') }}</el-button>
                <el-button text size="small" @click="toggleStatus(row)">
                  {{ row.status === 'ACTIVE' ? t('settingsExpire') : t('settingsActivate') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="t('settingsRates')" name="rates">
          <div class="toolbar">
            <el-button size="small" type="primary" @click="openRate">{{ t('settingsAddRate') }}</el-button>
            <span class="muted">{{ t('settingsRateHint') }}</span>
          </div>
          <el-table :data="rates" size="small" stripe>
            <el-table-column label="Pair" width="130">
              <template #default="{ row }">{{ row.base_currency }} / {{ row.quote_currency }}</template>
            </el-table-column>
            <el-table-column prop="rate" :label="t('settingsRate')" width="120" align="right" />
            <el-table-column prop="inverse" :label="t('settingsInverse')" width="120" align="right" />
            <el-table-column prop="effective_date" :label="t('settingsEffectiveDate')" width="150" />
            <el-table-column prop="source" :label="t('settingsSource')" width="120" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="t('settingsUsers')" name="users">
          <div class="toolbar">
            <el-button size="small" type="primary" @click="openUser">{{ t('settingsAddUser') }}</el-button>
          </div>
          <el-table :data="users" size="small" stripe>
            <el-table-column prop="username" :label="t('logsUsername')" width="150" />
            <el-table-column prop="real_name" :label="t('settingsRealName')" width="150" />
            <el-table-column prop="role" :label="t('settingsRole')" width="130" />
            <el-table-column :label="t('status')" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="t('settingsConfigs')" name="configs">
          <el-table :data="configs" size="small" stripe>
            <el-table-column prop="config_key" :label="t('settingsConfigKey')" width="240" />
            <el-table-column prop="config_value" :label="t('settingsConfigValue')" width="180" />
            <el-table-column prop="description" :label="t('remark')" show-overflow-tooltip />
          </el-table>
          <div class="card-title" style="margin-top: 20px">{{ t('settingsHealth') }}</div>
          <el-descriptions v-if="health" :column="3" border size="small">
            <el-descriptions-item :label="t('settingsHealth')">{{ health.status }}</el-descriptions-item>
            <el-descriptions-item label="Env">{{ health.env }}</el-descriptions-item>
            <el-descriptions-item label="DB">{{ health.database }}</el-descriptions-item>
            <el-descriptions-item label="Shops">{{ health.shopCount }}</el-descriptions-item>
            <el-descriptions-item label="Mock">{{ health.mockGateway }}</el-descriptions-item>
            <el-descriptions-item :label="t('settingsUptime')">{{ health.uptimeSeconds }}s</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="rateVisible" :title="t('settingsAddRate')" width="460px">
      <el-form label-position="top">
        <el-form-item label="Base">
          <el-select v-model="rateForm.baseCurrency" style="width: 100%">
            <el-option v-for="item in ['USD', 'GBP', 'SGD', 'CNY']" :key="item" :value="item" :label="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="Quote">
          <el-select v-model="rateForm.quoteCurrency" style="width: 100%">
            <el-option v-for="item in ['CNY', 'USD', 'GBP', 'SGD']" :key="item" :value="item" :label="item" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('settingsRate')">
          <el-input-number v-model="rateForm.rate" :min="0.0001" :step="0.01" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('settingsEffectiveDate')"><el-input v-model="rateForm.effectiveDate" placeholder="2026-11-22" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rateVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitRate">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="userVisible" :title="t('settingsAddUser')" width="460px">
      <el-form label-position="top">
        <el-form-item :label="t('logsUsername')"><el-input v-model="userForm.username" /></el-form-item>
        <el-form-item :label="t('settingsRealName')"><el-input v-model="userForm.realName" /></el-form-item>
        <el-form-item :label="t('password')"><el-input v-model="userForm.password" type="password" show-password /></el-form-item>
        <el-form-item :label="t('settingsRole')">
          <el-select v-model="userForm.role" style="width: 100%">
            <el-option v-for="item in ['ADMIN', 'OPERATOR', 'HOST', 'AGENCY']" :key="item" :value="item" :label="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="Email"><el-input v-model="userForm.email" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitUser">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
