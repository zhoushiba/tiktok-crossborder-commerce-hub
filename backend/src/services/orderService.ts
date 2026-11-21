import { orderRepo, type OrderQuery } from '../repositories/orderRepo';
import { shopRepo } from '../repositories/shopRepo';
import { productRepo } from '../repositories/productRepo';
import { currencyRepo } from '../repositories/currencyRepo';
import { inventoryRepo } from '../repositories/inventoryRepo';
import { tiktokClient } from './tiktokClient';
import { withTransaction } from '../db';
import { ApiError } from '../utils/response';
import { centsToYuan, convertCents, yuanToCents } from '../utils/money';
import { nowUtc } from '../utils/datetime';
import { generateTrackingNo } from '../utils/ids';
import type { PlatformOrder } from '../types';

const REFUNDABLE_STATUS = ['SHIPPED', 'DELIVERED'];

export interface SyncResult {
  shopId: number;
  fetched: number;
  inserted: number;
  duplicated: number;
  failed: number;
  pages: number;
  errors: Array<{ platformOrderId: string; message: string }>;
}

export const orderService = {
  list(query: OrderQuery) {
    const { list, total } = orderRepo.list(query);
    return {
      list: list.map((order) => ({
        ...order,
        total_amount_yuan: centsToYuan(order.total_amount_cent),
        base_amount_yuan: centsToYuan(order.base_amount_cent),
        overdue: order.status === 'PAID' && order.paid_at !== null && Date.now() - new Date(`${order.paid_at}Z`).getTime() > 48 * 3600 * 1000,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  detail(id: number) {
    const order = orderRepo.findById(id);
    if (!order) {
      throw ApiError.notFound(`订单 ${id} 不存在`);
    }
    const shop = shopRepo.findById(order.shop_id);
    return {
      ...order,
      total_amount_yuan: centsToYuan(order.total_amount_cent),
      base_amount_yuan: centsToYuan(order.base_amount_cent),
      shop,
      items: orderRepo.items(id),
      statusLogs: orderRepo.statusLogs(id),
      logistics: orderRepo.logistics(id),
    };
  },

  /**
   * 从 TikTok 开放平台（Mock 网关）同步订单：
   * 幂等键 = shop_id + platform_order_id，重复单只累加 duplicated 计数，不会重复入库。
   * 每单按创建当日汇率把外币金额折算成基准币（CNY）分写入 base_amount_cent。
   */
  async sync(input: { shopId?: number; status?: string; pageSize?: number } = {}): Promise<SyncResult[]> {
    const shops = input.shopId ? [shopRepo.findById(input.shopId)].filter(Boolean) : shopRepo.list().filter((s) => s.status === 'ACTIVE');
    if (!shops.length) {
      throw ApiError.badRequest('没有可同步的店铺（状态需为 ACTIVE）');
    }
    const results: SyncResult[] = [];
    for (const shop of shops) {
      const shopEntity = shop as NonNullable<typeof shop>;
      const { orders, fetchedPages } = await tiktokClient.searchOrders(shopEntity.id, {
        status: input.status,
        pageSize: input.pageSize,
      });
      const result: SyncResult = {
        shopId: shopEntity.id,
        fetched: orders.length,
        inserted: 0,
        duplicated: 0,
        failed: 0,
        pages: fetchedPages,
        errors: [],
      };
      withTransaction(() => {
        for (const remote of orders) {
          try {
            const rateDate = (remote.create_time ?? nowUtc()).slice(0, 10);
            const rateRow = currencyRepo.latestRate(shopEntity.currency_code, 'CNY', rateDate);
            const baseAmountCent =
              shopEntity.currency_code === 'CNY'
                ? remote.total_amount_cent
                : rateRow
                  ? convertCents(remote.total_amount_cent, rateRow.rate)
                  : remote.total_amount_cent;
            const { inserted, id } = orderRepo.insertIfAbsent({
              shopId: shopEntity.id,
              platformOrderId: remote.order_id,
              status: remote.status,
              buyerName: remote.buyer_name,
              currencyCode: remote.currency ?? shopEntity.currency_code,
              totalAmountCent: remote.total_amount_cent,
              exchangeRateId: rateRow?.id ?? null,
              baseAmountCent,
              siteCode: remote.site_code ?? null,
              paidAt: remote.paid_time ?? null,
              createdAt: remote.create_time,
            });
            if (!inserted) {
              result.duplicated += 1;
              continue;
            }
            for (const item of remote.items) {
              const product = productRepo.findBySku(item.sku);
              orderRepo.insertItem({
                order_id: id,
                product_id: product?.id ?? null,
                sku: item.sku,
                title: item.title,
                quantity: item.quantity,
                unit_price_cent: item.unit_price_cent,
                subtotal_cent: item.unit_price_cent * item.quantity,
              });
            }
            orderRepo.addStatusLog({ orderId: id, fromStatus: null, toStatus: remote.status, source: 'SYNC', remark: '从 TikTok Shop 同步' });
            result.inserted += 1;
          } catch (error) {
            result.failed += 1;
            result.errors.push({ platformOrderId: remote.order_id, message: (error as Error).message });
          }
        }
      });
      results.push(result);
    }
    return results;
  },

  /** 发货：校验状态、扣减库存、生成头程物流单，状态置 SHIPPED */
  ship(id: number, input: { carrier?: string; trackingNo?: string; deductInventory?: boolean }) {
    const order = orderRepo.findById(id);
    if (!order) {
      throw ApiError.notFound(`订单 ${id} 不存在`);
    }
    if (order.status !== 'PAID') {
      throw ApiError.conflict(`订单当前状态为 ${order.status}，只有 PAID 状态可以发货`);
    }
    const items = orderRepo.items(id);
    const carrier = input.carrier ?? 'YunExpress';
    const trackingNo = input.trackingNo ?? generateTrackingNo(carrier);
    withTransaction(() => {
      if (input.deductInventory !== false) {
        for (const item of items) {
          if (!item.product_id) continue;
          const ok = inventoryRepo.deduct(item.product_id, order.shop_id, item.quantity);
          if (!ok) {
            throw ApiError.conflict(`商品 ${item.sku} 库存不足，无法发货`);
          }
        }
      }
      orderRepo.updateStatus(id, 'SHIPPED', { shippedAt: nowUtc() });
      orderRepo.addStatusLog({ orderId: id, fromStatus: 'PAID', toStatus: 'SHIPPED', source: 'MANUAL', remark: `承运商 ${carrier}` });
      inventoryRepo.createLogistics({
        orderId: id,
        type: 'FIRST_LEG',
        carrier,
        trackingNo,
        origin: 'SZX',
        destination: order.site_code ?? 'US-WEST',
      });
    });
    return this.detail(id);
  },

  /** 妥投：SHIPPED → DELIVERED，并写入尾程签收信息 */
  confirmDelivery(id: number, input: { carrier?: string; trackingNo?: string } = {}) {
    const order = orderRepo.findById(id);
    if (!order) {
      throw ApiError.notFound(`订单 ${id} 不存在`);
    }
    if (order.status !== 'SHIPPED') {
      throw ApiError.conflict(`订单当前状态为 ${order.status}，只有 SHIPPED 状态可以确认妥投`);
    }
    const carrier = input.carrier ?? 'USPS';
    withTransaction(() => {
      orderRepo.updateStatus(id, 'DELIVERED', { deliveredAt: nowUtc() });
      orderRepo.addStatusLog({ orderId: id, fromStatus: 'SHIPPED', toStatus: 'DELIVERED', source: 'MANUAL', remark: '尾程派送签收' });
      inventoryRepo.createLogistics({
        orderId: id,
        type: 'LAST_LEG',
        carrier,
        trackingNo: input.trackingNo ?? generateTrackingNo(carrier),
        origin: order.site_code ?? 'US-WEST',
        destination: 'BUYER',
      });
    });
    return this.detail(id);
  },

  /** 退款：仅已发货/已妥投订单可申请；审批通过置 REFUNDED 并记录退款金额 */
  refund(id: number, input: { refundStatus: 'REQUESTED' | 'APPROVED' | 'REJECTED'; refundAmountYuan?: number; reason?: string }) {
    const order = orderRepo.findById(id);
    if (!order) {
      throw ApiError.notFound(`订单 ${id} 不存在`);
    }
    if (!REFUNDABLE_STATUS.includes(order.status) && order.status !== 'REFUNDING') {
      throw ApiError.conflict(`订单当前状态为 ${order.status}，不支持退款`);
    }
    const refundAmountCent =
      input.refundStatus === 'REJECTED'
        ? 0
        : input.refundAmountYuan !== undefined
          ? yuanToCents(input.refundAmountYuan)
          : order.total_amount_cent;
    if (refundAmountCent > order.total_amount_cent) {
      throw ApiError.badRequest('退款金额不能超过订单金额');
    }
    withTransaction(() => {
      orderRepo.applyRefund(id, input.refundStatus, refundAmountCent);
      orderRepo.addStatusLog({
        orderId: id,
        fromStatus: order.status,
        toStatus: input.refundStatus === 'APPROVED' ? 'REFUNDED' : input.refundStatus === 'REJECTED' ? order.status : 'REFUNDING',
        source: 'MANUAL',
        remark: `退款${input.refundStatus}：${input.reason ?? '无备注'}，金额 ${centsToYuan(refundAmountCent)} ${order.currency_code}`,
      });
    });
    return this.detail(id);
  },

  /** 手工改状态（仅运营/管理员），用于线下已处理但平台状态未回传的场景 */
  updateStatus(id: number, status: string, remark?: string) {
    const order = orderRepo.findById(id);
    if (!order) {
      throw ApiError.notFound(`订单 ${id} 不存在`);
    }
    const allowed = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'REFUNDING', 'REFUNDED', 'CANCELLED'];
    if (!allowed.includes(status)) {
      throw ApiError.badRequest(`status 必须是 ${allowed.join(' / ')} 之一`);
    }
    if (order.status === status) {
      throw ApiError.conflict(`订单已经是 ${status} 状态`);
    }
    withTransaction(() => {
      orderRepo.updateStatus(id, status, status === 'SHIPPED' ? { shippedAt: nowUtc() } : status === 'DELIVERED' ? { deliveredAt: nowUtc() } : {});
      orderRepo.addStatusLog({ orderId: id, fromStatus: order.status, toStatus: status, source: 'MANUAL', remark: remark ?? undefined });
    });
    return this.detail(id);
  },

  /** 导出 CSV（运营对账用），带 BOM 兼容 Excel 打开 */
  exportCsv(query: OrderQuery): string {
    const { list } = orderRepo.list({ ...query, page: 1, pageSize: 5000 });
    const header = '订单号,店铺,站点,状态,买家,币种,订单金额,折算人民币,商品数,下单时间,支付时间';
    const rows = list.map((order) =>
      [
        order.platform_order_id,
        order.shop_name ?? '',
        order.site_code ?? '',
        order.status,
        order.buyer_name ?? '',
        order.currency_code,
        centsToYuan(order.total_amount_cent),
        centsToYuan(order.base_amount_cent),
        order.item_count,
        order.created_at,
        order.paid_at ?? '',
      ].join(','),
    );
    return `\uFEFF${[header, ...rows].join('\n')}`;
  },

  /** 超时未发货清单（支付超 48 小时仍为 PAID），用于履约预警 */
  overdue(): Array<PlatformOrder & { hours: number }> {
    const { list } = orderRepo.list({ page: 1, pageSize: 200, overdueOnly: true });
    return list.map((order) => ({
      ...order,
      hours: order.paid_at ? Math.floor((Date.now() - new Date(`${order.paid_at}Z`).getTime()) / 3600000) : 0,
    }));
  },
};
