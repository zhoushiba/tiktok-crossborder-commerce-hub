import { inventoryRepo } from '../repositories/inventoryRepo';
import { ApiError } from '../utils/response';
import { centsToYuan } from '../utils/money';

export const inventoryService = {
  list(filter: { shopId?: number; lowStockOnly?: boolean; keyword?: string }) {
    return (inventoryRepo.list(filter) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      /** 缺货风险分级：低于安全库存为警告，为 0 为缺货 */
      stock_level:
        Number(row.available_qty) === 0 ? 'OUT_OF_STOCK' : Number(row.available_qty) < Number(row.safety_qty) ? 'LOW' : 'OK',
      sale_price_yuan: centsToYuan(Number(row.sale_price_cent ?? 0)),
      stock_value_yuan: centsToYuan(Number(row.available_qty) * Number(row.sale_price_cent ?? 0)),
    }));
  },

  lowStock() {
    const rows = this.list({ lowStockOnly: true }) as Array<Record<string, unknown>>;
    return { count: rows.length, list: rows };
  },

  adjust(input: { productId: number; shopId: number; availableQty: number; safetyQty?: number; warehouse?: string }) {
    if (input.availableQty < 0) {
      throw ApiError.badRequest('库存数量不能为负数');
    }
    inventoryRepo.adjust(input);
    return inventoryRepo.list({ shopId: input.shopId }).find((row) => {
      const record = row as Record<string, unknown>;
      return Number(record.product_id) === input.productId;
    });
  },

  logistics(filter: { status?: string; exceptionOnly?: boolean } = {}) {
    return inventoryRepo.logisticsList(filter);
  },

  markException(logisticsId: number, reason: string) {
    if (!reason) {
      throw ApiError.badRequest('必须填写异常原因');
    }
    const changes = inventoryRepo.markLogisticsException(logisticsId, reason);
    if (!changes) {
      throw ApiError.notFound(`物流单 ${logisticsId} 不存在`);
    }
    return { id: logisticsId, status: 'EXCEPTION', reason };
  },

  advance(logisticsId: number, status: string) {
    const allowed = ['PICKED_UP', 'IN_TRANSIT', 'CUSTOMS', 'DELIVERED'];
    if (!allowed.includes(status)) {
      throw ApiError.badRequest(`status 必须是 ${allowed.join(' / ')} 之一`);
    }
    const changes = inventoryRepo.advanceLogistics(logisticsId, status);
    if (!changes) {
      throw ApiError.notFound(`物流单 ${logisticsId} 不存在`);
    }
    return { id: logisticsId, status };
  },
};
