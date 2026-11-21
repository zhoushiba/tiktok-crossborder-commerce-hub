<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { orderApi, type LogisticsRow, type Order } from '@/api';
import { useI18n } from '@/i18n';
import { formatDateTime, formatMoney, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const syncing = ref(false);
const rows = ref<Order[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const status = ref('');

const statusOptions = ['', 'PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'REFUNDING', 'CANCELLED'];

const detailVisible = ref(false);
const detail = ref<Record<string, any> | null>(null);

const shipVisible = ref(false);
const shipForm = reactive({ id: 0, carrier: 'YunExpress', trackingNo: '', deductInventory: true });

const refundVisible = ref(false);
const refundForm = reactive({ id: 0, refundStatus: 'APPROVED', refundAmountYuan: 0, reason: '' });

async function load() {
  loading.value = true;
  try {
    const result = await orderApi.list({
      status: status.value || undefined,
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function search() {
  page.value = 1;
  load();
}

async function syncOrders() {
  syncing.value = true;
  try {
    const result = await orderApi.sync({ shopId: 1, pageSize: 4 });
    const first = result[0];
    ElMessage.success(
      `${t('orderSyncResult')} · ${t('orderSyncFetched')} ${first.fetched} / ${t('orderSyncInserted')} ${first.inserted} / ${t('orderSyncDuplicated')} ${first.duplicated}`,
    );
    await load();
  } finally {
    syncing.value = false;
  }
}

async function openDetail(row: Order) {
  detailVisible.value = true;
  detail.value = await orderApi.detail(row.id);
}

function openShip(row: Order) {
  shipForm.id = row.id;
  shipForm.trackingNo = `YT${Date.now().toString().slice(-11)}`;
  shipForm.deductInventory = true;
  shipVisible.value = true;
}

async function submitShip() {
  await orderApi.ship(shipForm.id, {
    carrier: shipForm.carrier,
    trackingNo: shipForm.trackingNo,
    deductInventory: shipForm.deductInventory,
  });
  shipVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

function openRefund(row: Order) {
  refundForm.id = row.id;
  refundForm.refundAmountYuan = Number((row.total_amount_cent / 100).toFixed(2));
  refundForm.reason = '';
  refundVisible.value = true;
}

async function submitRefund() {
  await orderApi.refund(refundForm.id, {
    refundStatus: refundForm.refundStatus,
    refundAmountYuan: refundForm.refundAmountYuan,
    reason: refundForm.reason || undefined,
  });
  refundVisible.value = false;
  ElMessage.success(t('success'));
  await load();
}

async function confirmDelivery(row: Order) {
  await orderApi.delivery(row.id);
  ElMessage.success(t('success'));
  await load();
}
</script>

<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>{{ t('menuOrders') }}</h2>
        <div class="sub">{{ t('orderTimeline') }}</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-button size="small" @click="orderApi.exportCsv()">{{ t('orderExport') }}</el-button>
        <el-button size="small" type="primary" :loading="syncing" @click="syncOrders">{{ t('orderSync') }}</el-button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px">
      <div class="toolbar">
        <el-radio-group v-model="status" size="small" @change="search">
          <el-radio-button v-for="item in statusOptions" :key="item" :value="item">
            {{ item ? statusText(item) : t('all') }}
          </el-radio-button>
        </el-radio-group>
        <el-input v-model="keyword" :placeholder="`${t('orderNo')} / ${t('orderBuyer')}`" clearable style="width: 240px" @keyup.enter="search" />
        <el-button type="primary" @click="search">{{ t('search') }}</el-button>
        <span class="muted">{{ t('orderCount') }}: {{ total }}</span>
      </div>

      <el-table v-loading="loading" :data="rows" size="small" stripe>
        <el-table-column prop="platform_order_id" :label="t('orderNo')" width="190" />
        <el-table-column prop="shop_name" :label="t('orderShop')" min-width="150" show-overflow-tooltip />
        <el-table-column prop="buyer_name" :label="t('orderBuyer')" width="130" />
        <el-table-column :label="t('orderAmount')" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.total_amount_cent / 100) }} {{ row.currency_code }}</template>
        </el-table-column>
        <el-table-column :label="t('orderBaseAmount')" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.base_amount_yuan) }}</template>
        </el-table-column>
        <el-table-column :label="t('status')" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('orderCreatedAt')" width="165">
          <template #default="{ row }">{{ formatDateTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="230" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="openDetail(row)">{{ t('detail') }}</el-button>
            <el-button v-if="row.status === 'PAID'" text size="small" type="primary" @click="openShip(row)">{{ t('orderShip') }}</el-button>
            <el-button v-if="row.status === 'SHIPPED'" text size="small" type="success" @click="confirmDelivery(row)">
              {{ t('orderDelivery') }}
            </el-button>
            <el-button
              v-if="['SHIPPED', 'DELIVERED', 'REFUNDING'].includes(row.status)"
              text
              size="small"
              type="danger"
              @click="openRefund(row)"
            >
              {{ t('orderRefund') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 14px; justify-content: flex-end"
        @change="load"
      />
    </div>

    <el-drawer v-model="detailVisible" :title="`${t('detail')} · ${detail?.platform_order_id ?? ''}`" size="640px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('orderShop')">{{ detail.shop_name }}</el-descriptions-item>
          <el-descriptions-item :label="t('orderBuyer')">{{ detail.buyer_name }}</el-descriptions-item>
          <el-descriptions-item :label="t('status')">{{ statusText(detail.status) }}</el-descriptions-item>
          <el-descriptions-item :label="t('orderSite')">{{ detail.site_code ?? '-' }}</el-descriptions-item>
          <el-descriptions-item :label="t('orderAmount')">
            {{ formatMoney(detail.total_amount_cent / 100) }} {{ detail.currency_code }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('orderBaseAmount')">{{ formatMoney(detail.base_amount_yuan) }}</el-descriptions-item>
        </el-descriptions>

        <div class="card-title" style="margin-top: 20px">{{ t('orderItems') }}</div>
        <el-table :data="detail.items" size="small">
          <el-table-column prop="sku" :label="t('sku')" width="150" />
          <el-table-column prop="title" :label="t('productTitle')" show-overflow-tooltip />
          <el-table-column prop="quantity" :label="t('quantity')" width="80" align="right" />
          <el-table-column :label="t('price')" width="110" align="right">
            <template #default="{ row }">{{ formatMoney(Number(row.unit_price_cent) / 100) }}</template>
          </el-table-column>
        </el-table>

        <div class="card-title" style="margin-top: 20px">{{ t('orderLogistics') }}</div>
        <el-table :data="detail.logistics" size="small">
          <el-table-column prop="carrier" :label="t('logisticsCarrier')" width="120" />
          <el-table-column prop="tracking_no" :label="t('logisticsTracking')" width="170" />
          <el-table-column :label="t('logisticsStatus')" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="destination" :label="t('orderSite')" />
        </el-table>

        <div class="card-title" style="margin-top: 20px">{{ t('orderTimeline') }}</div>
        <el-timeline>
          <el-timeline-item v-for="log in detail.statusLogs" :key="`${log.created_at}-${log.to_status}`" :timestamp="formatDateTime(log.created_at)" placement="top">
            {{ log.from_status ? `${statusText(log.from_status)} → ` : '' }}{{ statusText(log.to_status) }}
            <span class="muted" v-if="log.source">· {{ log.source }}</span>
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-drawer>

    <el-dialog v-model="shipVisible" :title="t('orderShip')" width="440px">
      <el-form label-position="top">
        <el-form-item :label="t('orderCarrier')">
          <el-select v-model="shipForm.carrier" style="width: 100%">
            <el-option label="YunExpress" value="YunExpress" />
            <el-option label="4PX" value="4PX" />
            <el-option label="DHL eCommerce" value="DHL eCommerce" />
            <el-option label="FedEx" value="FedEx" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('orderTrackingNo')">
          <el-input v-model="shipForm.trackingNo" />
        </el-form-item>
        <el-form-item :label="t('orderDeductInventory')">
          <el-switch v-model="shipForm.deductInventory" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitShip">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="refundVisible" :title="t('orderRefund')" width="440px">
      <el-form label-position="top">
        <el-form-item :label="t('commissionStatus')">
          <el-select v-model="refundForm.refundStatus" style="width: 100%">
            <el-option value="REQUESTED" :label="t('statusRefunding')" />
            <el-option value="APPROVED" :label="t('statusRefunded')" />
            <el-option value="REJECTED" :label="t('statusProcessing')" />
          </el-select>
        </el-form-item>
        <el-form-item :label="`${t('orderRefundAmount')} (CNY)`">
          <el-input-number v-model="refundForm.refundAmountYuan" :min="0" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('orderRefundReason')">
          <el-input v-model="refundForm.reason" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" @click="submitRefund">{{ t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
