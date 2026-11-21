<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { inventoryApi, type InventoryRow, type LogisticsRow } from '@/api';
import { useI18n } from '@/i18n';
import { formatDateTime, formatMoney, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const rows = ref<InventoryRow[]>([]);
const logistics = ref<LogisticsRow[]>([]);
const keyword = ref('');
const lowStockOnly = ref(false);
const tab = ref('stock');
const logisticsStatus = ref('');
const exceptionOnly = ref(false);

const lowStockCount = ref(0);

const adjustVisible = ref(false);
const adjustForm = reactive({ productId: 0, shopId: 1, availableQty: 0, safetyQty: 20, label: '' });

const exceptionVisible = ref(false);
const exceptionForm = reactive({ id: 0, reason: '' });

const totals = computed(() => ({
  sku: rows.value.length,
  stockValue: rows.value.reduce((sum, row) => sum + Number(row.stock_value_yuan ?? 0), 0),
  shortage: rows.value.filter((row) => row.stock_level !== 'OK').length,
}));

async function loadStock() {
  loading.value = true;
  try {
    rows.value = await inventoryApi.list({
      keyword: keyword.value || undefined,
      lowStockOnly: lowStockOnly.value ? true : undefined,
    });
    lowStockCount.value = (await inventoryApi.lowStock()).count;
  } finally {
    loading.value = false;
  }
}

async function loadLogistics() {
  loading.value = true;
  try {
    logistics.value = await inventoryApi.logistics({
      status: logisticsStatus.value || undefined,
      exceptionOnly: exceptionOnly.value ? true : undefined,
    });
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadStock(), loadLogistics()]);
});

function openAdjust(row: InventoryRow) {
  adjustForm.productId = row.product_id;
  adjustForm.shopId = row.shop_id;
  adjustForm.availableQty = row.available_qty;
  adjustForm.safetyQty = row.safety_qty;
  adjustForm.label = `${row.sku} · ${row.shop_name}`;
  adjustVisible.value = true;
}

async function submitAdjust() {
  await inventoryApi.adjust({
    productId: adjustForm.productId,
    shopId: adjustForm.shopId,
    availableQty: adjustForm.availableQty,
    safetyQty: adjustForm.safetyQty,
  });
  adjustVisible.value = false;
  ElMessage.success(t('success'));
  await loadStock();
}

function openException(row: LogisticsRow) {
  exceptionForm.id = row.id;
  exceptionForm.reason = '';
  exceptionVisible.value = true;
}

async function submitException() {
  await inventoryApi.markException(exceptionForm.id, exceptionForm.reason);
  exceptionVisible.value = false;
  ElMessage.success(t('success'));
  await loadLogistics();
}

async function advance(row: LogisticsRow, status: string) {
  await inventoryApi.advance(row.id, status);
  ElMessage.success(t('success'));
  await loadLogistics();
}

const nextLogisticsStatuses: Record<string, string[]> = {
  CREATED: ['PICKED_UP'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['CUSTOMS'],
  CUSTOMS: ['DELIVERED'],
  EXCEPTION: ['IN_TRANSIT'],
};

const stockType = (level: string) => (level === 'OK' ? 'success' : level === 'LOW' ? 'warning' : 'danger');
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="page-title">
      <div>
        <h2>{{ t('menuInventory') }}</h2>
        <div class="sub">{{ t('inventorySubtitle') }}</div>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom: 16px">
      <div class="card kpi"><span class="label">{{ t('inventorySku') }}</span><span class="value">{{ totals.sku }}</span></div>
      <div class="card kpi"><span class="label">{{ t('inventoryValue') }}</span><span class="value">{{ formatMoney(totals.stockValue) }}</span></div>
      <div class="card kpi"><span class="label">{{ t('inventoryLowStock') }}</span><span class="value" style="color: var(--brand)">{{ lowStockCount }}</span></div>
      <div class="card kpi"><span class="label">{{ t('logisticsCount') }}</span><span class="value">{{ logistics.length }}</span></div>
    </div>

    <div class="card">
      <el-tabs v-model="tab">
        <el-tab-pane :label="t('inventoryStock')" name="stock">
          <div class="toolbar">
            <el-input v-model="keyword" :placeholder="`${t('sku')} / ${t('productTitle')}`" clearable style="width: 240px" @keyup.enter="loadStock" />
            <el-button type="primary" @click="loadStock">{{ t('search') }}</el-button>
            <el-checkbox v-model="lowStockOnly" @change="loadStock">{{ t('inventoryOnlyLow') }}</el-checkbox>
            <span class="muted">{{ t('inventorySafetyHint') }}</span>
          </div>

          <el-table :data="rows" size="small" stripe>
            <el-table-column prop="sku" :label="t('sku')" width="140" />
            <el-table-column prop="title" :label="t('productTitle')" min-width="200" show-overflow-tooltip />
            <el-table-column prop="shop_name" :label="t('orderShop')" width="170" show-overflow-tooltip />
            <el-table-column prop="warehouse" :label="t('inventoryWarehouse')" width="150" />
            <el-table-column prop="available_qty" :label="t('inventoryAvailable')" width="110" align="right" />
            <el-table-column prop="safety_qty" :label="t('inventorySafety')" width="110" align="right" />
            <el-table-column :label="t('inventoryGap')" width="100" align="right">
              <template #default="{ row }">
                <span :style="{ color: Number(row.gap_qty) > 0 ? 'var(--brand)' : 'inherit' }">{{ row.gap_qty }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('inventoryLevel')" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="stockType(row.stock_level)" effect="plain">{{ statusText(row.stock_level) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('inventoryValue')" width="130" align="right">
              <template #default="{ row }">{{ formatMoney(row.stock_value_yuan) }}</template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="120" fixed="right">
              <template #default="{ row }">
                <el-button text size="small" type="primary" @click="openAdjust(row)">{{ t('inventoryAdjust') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane :label="t('inventoryLogistics')" name="logistics">
          <div class="toolbar">
            <el-select v-model="logisticsStatus" clearable :placeholder="t('logisticsStatus')" style="width: 170px" @change="loadLogistics">
              <el-option
                v-for="item in ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED', 'EXCEPTION']"
                :key="item"
                :value="item"
                :label="statusText(item)"
              />
            </el-select>
            <el-checkbox v-model="exceptionOnly" @change="loadLogistics">{{ t('logisticsOnlyException') }}</el-checkbox>
          </div>

          <el-table :data="logistics" size="small" stripe>
            <el-table-column prop="tracking_no" :label="t('logisticsTracking')" width="180" />
            <el-table-column prop="platform_order_id" :label="t('orderNo')" width="190" />
            <el-table-column prop="carrier" :label="t('logisticsCarrier')" width="130" />
            <el-table-column prop="type" :label="t('logisticsType')" width="110" />
            <el-table-column prop="origin" :label="t('logisticsOrigin')" width="120" />
            <el-table-column prop="destination" :label="t('logisticsDestination')" width="120" />
            <el-table-column :label="t('logisticsStatus')" width="120">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('logisticsException')" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">{{ row.exception_reason || '-' }}</template>
            </el-table-column>
            <el-table-column :label="t('createdAt')" width="165">
              <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column :label="t('actions')" width="230" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-for="status in nextLogisticsStatuses[row.status] ?? []"
                  :key="status"
                  text
                  size="small"
                  type="primary"
                  @click="advance(row, status)"
                >
                  {{ statusText(status) }}
                </el-button>
                <el-button v-if="Number(row.exception_flag) === 0" text size="small" type="danger" @click="openException(row)">
                  {{ t('logisticsMarkException') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="adjustVisible" :title="`${t('inventoryAdjust')} · ${adjustForm.label}`" width="440px">
      <el-form label-position="top">
        <el-form-item :label="t('inventoryAvailable')">
          <el-input-number v-model="adjustForm.availableQty" :min="0" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('inventorySafety')">
          <el-input-number v-model="adjustForm.safetyQty" :min="0" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitAdjust">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="exceptionVisible" :title="t('logisticsMarkException')" width="440px">
      <el-form label-position="top">
        <el-form-item :label="t('logisticsExceptionReason')">
          <el-input v-model="exceptionForm.reason" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="exceptionVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitException">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
