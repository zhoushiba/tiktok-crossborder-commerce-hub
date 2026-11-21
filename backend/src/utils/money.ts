/**
 * 金额工具。
 *
 * 全链路以「分」为最小单位做整数运算，避免 0.1 + 0.2 这类浮点误差；
 * 汇率换算结果四舍五入到分；展示层用 Intl.NumberFormat 按币种格式化。
 */

export function yuanToCents(value: number | string): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) throw new Error(`金额非法: ${value}`);
  return Math.round(num * 100);
}

export function centsToYuan(cents: number): number {
  return Math.round(cents) / 100;
}

/** 按汇率换算（分 -> 分），银行家舍入不必要，这里用四舍五入到分 */
export function convertCents(cents: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`汇率非法: ${rate}`);
  return Math.round(cents * rate);
}

export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToYuan(cents));
}

/** 计算百分比（保留两位小数），传入分子分母的"分"值 */
export function ratioPercent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
