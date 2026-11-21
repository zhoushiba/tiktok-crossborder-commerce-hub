<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { productApi, type Product, type ProfitResult } from '@/api';
import { useI18n } from '@/i18n';
import { formatMoney, percent, statusText, statusType } from '@/utils/format';

const { t } = useI18n();

const loading = ref(false);
const rows = ref<Product[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const category = ref('');
const categories = ref<Array<{ category: string; count: number }>>([]);

const detailVisible = ref(false);
const detail = ref<Record<string, any> | null>(null);

const profitVisible = ref(false);
const profitForm = reactive({ salePrice: 19.9, costPrice: 4.2, weightG: 350, commissionRate: 0.1, currencyCode: 'USD' });
const profit = ref<ProfitResult | null>(null);

const importVisible = ref(false);
const importText = ref('');
const importResult = ref<{ total: number; successCount: number; errorCount: number; success: string[]; errors: Array<{ row: number; sku: string; message: string }> } | null>(null);

async function load() {
  loading.value = true;
  try {
    const result = await productApi.list({ keyword: keyword.value || undefined, category: category.value || undefined, page: page.value, pageSize: pageSize.value });
    rows.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

async function loadMeta() {
  categories.value = await productApi.categories();
}

onMounted(async () => {
  await Promise.all([load(), loadMeta()]);
});

function search() {
  page.value = 1;
  load();
}

function reset() {
  keyword.value = '';
  category.value = '';
  search();
}

async function openDetail(row: Product) {
  detailVisible.value = true;
  detail.value = await productApi.detail(row.id);
}

async function calcProfit() {
  profit.value = await productApi.profit({ ...profitForm });
}

async function openProfit(row?: Product) {
  profitVisible.value = true;
  profit.value = null;
  if (row) {
    profitForm.salePrice = Number((row.sale_price_cent / 100).toFixed(2));
    profitForm.costPrice = Number((row.cost_price_cent / 100).toFixed(2));
    profitForm.weightG = row.weight_g;
    profitForm.commissionRate = row.commission_rate;
    profitForm.currencyCode = row.currency_code;
  }
  await calcProfit();
}

function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    importText.value = String(reader.result ?? '');
  };
  reader.readAsText(file, 'utf-8');
}

async function submitImport() {
  if (!importText.value.trim()) {
    ElMessage.warning(t('csvHint'));
    return;
  }
  importResult.value = await productApi.importCsv(importText.value, 'products.csv');
  ElMessage.success(`${t('import')}: ${importResult.value.successCount} / ${importResult.value.total}`);
  await Promise.all([load(), loadMeta()]);
}

async function remove(row: Product) {
  await productApi.remove(row.id);
  ElMessage.success(t('success'));
  await load();
}

const detailSku = computed(() => detail.value?.sku ?? '');
</script>

<template>
  <div class="page">
    <div class="page-title">
      <div>
        <h2>{{ t('menuProducts') }}</h2>
        <div class="sub">{{ t('profitHint') }}</div>
      </div>
      <div class="toolbar" style="margin-bottom: 0">
        <el-button size="small" @click="productApi.exportCsv()">{{ t('exportCsv') }}</el-button>
        <el-button size="small" @click="importVisible = true">{{ t('importCsv') }}</el-button>
        <el-button size="small" type="primary" @click="openProfit()">{{ t('profitCalculator') }}</el-button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px">
      <div class="toolbar">
        <el-input v-model="keyword" :placeholder="t('keyword')" clearable style="width: 220px" @keyup.enter="search" />
        <el-select v-model="category" :placeholder="t('category')" clearable style="width: 180px">
          <el-option v-for="item in categories" :key="item.category" :label="`${item.category} (${item.count})`" :value="item.category" />
        </el-select>
        <el-button type="primary" @click="search">{{ t('search') }}</el-button>
        <el-button @click="reset">{{ t('reset') }}</el-button>
        <span class="muted">{{ t('productsTotal') }}: {{ total }}</span>
      </div>

      <el-table v-loading="loading" :data="rows" size="small" stripe @row-dblclick="openDetail">
        <el-table-column prop="sku" :label="t('sku')" width="150" />
        <el-table-column prop="title" :label="t('productTitle')" min-width="220" show-overflow-tooltip />
        <el-table-column prop="category" :label="t('category')" width="120" />
        <el-table-column :label="t('costPrice')" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.cost_price_cent / 100) }}</template>
        </el-table-column>
        <el-table-column :label="t('salePrice')" width="110" align="right">
          <template #default="{ row }">{{ formatMoney(row.sale_price_cent / 100) }}</template>
        </el-table-column>
        <el-table-column prop="weight_g" :label="t('weight')" width="100" align="right" />
        <el-table-column :label="t('commissionRate')" width="100" align="right">
          <template #default="{ row }">{{ percent(row.commission_rate * 100, 0) }}</template>
        </el-table-column>
        <el-table-column prop="shipping_mode" :label="t('shippingMode')" width="120" />
        <el-table-column :label="t('status')" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('actions')" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text size="small" @click="openDetail(row)">{{ t('detail') }}</el-button>
            <el-button text size="small" @click="openProfit(row)">{{ t('profitCalculator') }}</el-button>
            <el-button text size="small" type="danger" @click="remove(row)">{{ t('delete') }}</el-button>
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

    <el-drawer v-model="detailVisible" :title="`${t('detail')} · ${detailSku}`" size="620px">
      <template v-if="detail">
        <h3 style="margin: 0 0 6px">{{ detail.title }}</h3>
        <p class="muted" style="margin: 0 0 16px">{{ detail.category }} · {{ detail.shipping_mode }} · {{ detail.weight_g }}g</p>

        <el-descriptions :column="2" border size="small">
          <el-descriptions-item :label="t('costPrice')">{{ formatMoney(detail.cost_price_cent / 100) }}</el-descriptions-item>
          <el-descriptions-item :label="t('salePrice')">{{ formatMoney(detail.sale_price_cent / 100) }}</el-descriptions-item>
          <el-descriptions-item :label="t('grossMargin')">{{ percent(detail.profit.gross_margin) }}</el-descriptions-item>
          <el-descriptions-item :label="t('breakeven')">{{ formatMoney(detail.profit.breakeven_price_cent / 100) }}</el-descriptions-item>
        </el-descriptions>

        <div class="card-title" style="margin-top: 20px">{{ t('costDetail') }}</div>
        <el-table :data="detail.costs" size="small">
          <el-table-column prop="cost_type" :label="t('category')" />
          <el-table-column :label="t('amount')" align="right">
            <template #default="{ row }">{{ formatMoney(Number(row.amount_cent) / 100) }}</template>
          </el-table-column>
          <el-table-column prop="note" :label="t('remark')" />
        </el-table>

        <div class="card-title" style="margin-top: 20px">{{ t('inventoryList') }}</div>
        <el-table :data="detail.inventory" size="small">
          <el-table-column prop="shop_name" :label="t('orderShop')" />
          <el-table-column prop="available_qty" :label="t('stockAvailable')" align="right" />
          <el-table-column prop="safety_qty" :label="t('stockSafety')" align="right" />
          <el-table-column prop="warehouse" :label="t('stockWarehouse')" />
        </el-table>
      </template>
    </el-drawer>

    <el-dialog v-model="profitVisible" :title="t('profitCalculator')" width="640px">
      <div class="grid grid-2">
        <el-form label-position="top">
          <el-form-item :label="`${t('salePrice')} (${profitForm.currencyCode})`">
            <el-input-number v-model="profitForm.salePrice" :min="0.1" :step="0.5" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="`${t('costPrice')} (${profitForm.currencyCode})`">
            <el-input-number v-model="profitForm.costPrice" :min="0.1" :step="0.5" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('weight')">
            <el-input-number v-model="profitForm.weightG" :min="10" :step="10" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('commissionRate')">
            <el-input-number v-model="profitForm.commissionRate" :min="0" :max="0.5" :step="0.01" style="width: 100%" />
          </el-form-item>
          <el-button type="primary" @click="calcProfit">{{ t('submit') }}</el-button>
        </el-form>

        <div v-if="profit">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item :label="t('salePriceCny')">{{ formatMoney(profit.sale_price_cent / 100) }}</el-descriptions-item>
            <el-descriptions-item :label="t('freight')">{{ formatMoney(profit.freight_cny_cent / 100) }}</el-descriptions-item>
            <el-descriptions-item :label="t('platformFee')">{{ formatMoney(profit.platform_fee_cny_cent / 100) }}</el-descriptions-item>
            <el-descriptions-item :label="t('commissionFee')">{{ formatMoney(profit.commission_cny_cent / 100) }}</el-descriptions-item>
            <el-descriptions-item :label="t('grossProfit')">{{ formatMoney(profit.gross_profit_cny_cent / 100) }}</el-descriptions-item>
            <el-descriptions-item :label="t('grossMargin')">{{ percent(profit.gross_margin) }}</el-descriptions-item>
            <el-descriptions-item :label="t('breakeven')">{{ formatMoney(profit.breakeven_price_cent / 100) }}</el-descriptions-item>
          </el-descriptions>
          <el-tag style="margin-top: 12px" :type="profit.profitable ? 'success' : 'danger'" effect="dark">
            {{ profit.profitable ? t('profitable') : t('notProfitable') }}
          </el-tag>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="importVisible" :title="t('importCsv')" width="720px">
      <p class="muted">{{ t('csvHint') }}</p>
      <input type="file" accept=".csv,text/csv" @change="pickFile" />
      <el-input v-model="importText" type="textarea" :rows="8" style="margin-top: 12px" placeholder="sku,title,category,cost_price,sale_price,currency,weight_g" />
      <div v-if="importResult" style="margin-top: 14px">
        <el-alert
          :title="`${t('csvResult')}: ${t('csvSuccess')} ${importResult.successCount} / ${t('csvFailed')} ${importResult.errorCount}`"
          :type="importResult.errorCount ? 'warning' : 'success'"
          :closable="false"
        />
        <el-table v-if="importResult.errors.length" :data="importResult.errors" size="small" style="margin-top: 10px">
          <el-table-column prop="row" :label="t('csvRow')" width="80" />
          <el-table-column prop="sku" :label="t('sku')" width="160" />
          <el-table-column prop="message" :label="t('csvReason')" />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">{{ t('close') }}</el-button>
        <el-button type="primary" @click="submitImport">{{ t('import') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
