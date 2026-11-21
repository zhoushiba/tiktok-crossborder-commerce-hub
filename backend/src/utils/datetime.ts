/**
 * 时间与时区工具。
 *
 * 约定：数据库里所有时间都是 UTC 字符串 'YYYY-MM-DD HH:MM:SS'；
 * 需要"站点当地日期"时，用 Intl.DateTimeFormat 指定 IANA 时区换算，
 * 这样日报按各站点当地 0 点切分时不会串天。
 */

export const UTC_FORMAT = 'YYYY-MM-DD HH:mm:ss';

export function nowUtc(): string {
  return toUtcString(new Date());
}

export function toUtcString(date: Date): string {
  const iso = date.toISOString(); // 2026-01-02T03:04:05.000Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

export function parseUtc(value: string | Date | null | undefined): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  // 兼容 'YYYY-MM-DD HH:mm:ss' 与 ISO 两种存储形态
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  return new Date(normalized);
}

/** 把 UTC 时间格式化成指定时区的 'YYYY-MM-DD HH:mm' */
export function formatInTimeZone(value: string | Date, timeZone: string): string {
  const date = parseUtc(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** 指定时区下的当地日期 'YYYY-MM-DD' */
export function localDateInTimeZone(value: string | Date, timeZone: string): string {
  const date = parseUtc(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * 站点当地某一天的 UTC 起止时间（左闭右开）。
 * 反向换算：取当地 00:00 对应的 UTC 时间点。
 */
export function utcRangeForLocalDay(localDate: string, timeZone: string): { start: string; end: string } {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`非法日期: ${localDate}`);
  // 先假设当地零点就是 UTC 零点，再用该时刻在目标时区的偏移量修正
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offsetMinutes = timeZoneOffsetMinutes(new Date(guess), timeZone);
  const startMs = guess - offsetMinutes * 60_000;
  const endMs = startMs + 24 * 3600_000 - 1;
  return { start: toUtcString(new Date(startMs)), end: toUtcString(new Date(endMs)) };
}

/** 计算某时刻在指定时区相对 UTC 的偏移（分钟，东为正） */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** 最近 n 天（含今天）的 UTC 日期串列表，用于趋势图 */
export function recentUtcDates(days: number, endDate = new Date()): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(endDate.getTime() - i * 86_400_000);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
