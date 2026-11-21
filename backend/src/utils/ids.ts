import { getDb } from '../db';

/** 生成业务单号：前缀 + yyyyMMdd + 4 位流水，例如 ST202611220001 */
export function nextBusinessNo(prefix: string, table: string, column: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  const like = `${prefix}${day}%`;
  const row = getDb()
    .prepare(`SELECT ${column} AS no FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`)
    .get(like) as { no?: string } | undefined;
  const seq = row?.no ? Number(row.no.slice(-4)) + 1 : 1;
  return `${prefix}${day}${String(seq).padStart(4, '0')}`;
}

/** 生成达人专属链接码，例如 LK-US-8F3A2C */
export function generateLinkCode(region: string): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LK-${region}-${random}`;
}

export function generateTrackingNo(carrier: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `${carrier.toUpperCase().slice(0, 2)}${day}${random}`;
}
