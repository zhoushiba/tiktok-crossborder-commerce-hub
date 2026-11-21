/**
 * 展示层格式化工具：金额、状态文案、百分比。
 * 后端金额统一用「分」，展示统一转「元」。
 */

export function formatMoney(yuan: number | null | undefined, digits = 2): string {
  const value = Number(yuan ?? 0);
  return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('zh-CN');
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待支付',
  PAID: '已支付',
  SHIPPED: '已发货',
  DELIVERED: '已妥投',
  REFUNDING: '退款中',
  REFUNDED: '已退款',
  CANCELLED: '已取消',
  PLANNED: '待开播',
  LIVE: '直播中',
  ENDED: '已结束',
  REVIEWED: '已复盘',
  DRAFT: '草稿',
  APPROVED: '已审批',
  CONFIRMED: '已确认',
  SETTLED: '已结算',
  ACTIVE: '启用',
  EXPIRED: '已过期',
  OPEN: '待处理',
  PROCESSING: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
  ON_SALE: '在售',
  OFF_SALE: '已下架',
  ARCHIVED: '已归档',
  CREATED: '已创建',
  PICKED_UP: '已揽收',
  IN_TRANSIT: '干线运输',
  CUSTOMS: '清关中',
  EXCEPTION: '异常',
  DELIVERED_LOGISTICS: '已妥投',
  LOW: '低库存',
  OK: '正常',
  OUT_OF_STOCK: '缺货',
};

export function statusText(status: string | null | undefined): string {
  if (!status) return '-';
  return STATUS_TEXT[status] ?? status;
}

const STATUS_TYPE: Record<string, string> = {
  PENDING: 'info',
  PAID: 'primary',
  SHIPPED: 'warning',
  DELIVERED: 'success',
  REFUNDING: 'warning',
  REFUNDED: 'danger',
  CANCELLED: 'info',
  PLANNED: 'info',
  LIVE: 'danger',
  ENDED: 'info',
  REVIEWED: 'success',
  DRAFT: 'info',
  APPROVED: 'primary',
  CONFIRMED: 'primary',
  SETTLED: 'success',
  ACTIVE: 'success',
  EXPIRED: 'info',
  ON_SALE: 'success',
  OFF_SALE: 'info',
  ARCHIVED: 'info',
  OPEN: 'warning',
  PROCESSING: 'primary',
  RESOLVED: 'success',
  CLOSED: 'info',
  CREATED: 'info',
  PICKED_UP: 'primary',
  IN_TRANSIT: 'warning',
  CUSTOMS: 'warning',
  EXCEPTION: 'danger',
  LOW: 'warning',
  OK: 'success',
  OUT_OF_STOCK: 'danger',
};

export function statusType(status: string | null | undefined): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  const value = STATUS_TYPE[status ?? ''] ?? 'info';
  return value as 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

export function percent(value: number | null | undefined, digits = 2): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}
