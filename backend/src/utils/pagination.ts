import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export interface PaginationInput {
  page: number;
  pageSize: number;
}

export function normalizePagination(query: Record<string, unknown>): PaginationInput {
  const parsed = paginationSchema.safeParse(query);
  if (parsed.success) return parsed.data;
  return { page: 1, pageSize: 20 };
}

export function offsetOf(pagination: PaginationInput): number {
  return (pagination.page - 1) * pagination.pageSize;
}

/** 生成 'YYYY-MM' 形式的统计月份 */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}
