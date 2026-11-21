import { affiliateRepo } from '../repositories/affiliateRepo';
import { orderRepo } from '../repositories/orderRepo';
import { productRepo } from '../repositories/productRepo';
import { ApiError } from '../utils/response';
import { centsToYuan } from '../utils/money';
import { generateLinkCode } from '../utils/ids';

export const affiliateService = {
  listInfluencers(filter: { keyword?: string; region?: string; status?: string } = {}) {
    const influencers = affiliateRepo.listInfluencers(filter);
    return influencers.map((item) => {
      const links = affiliateRepo.links(item.id);
      const commissions = affiliateRepo.listCommissions({ influencerId: item.id });
      const pending = commissions
        .filter((c) => c.status === 'PENDING')
        .reduce((acc, c) => acc + c.commission_amount_cent, 0);
      return {
        ...item,
        total_gmv_yuan: centsToYuan(item.total_gmv_cent),
        link_count: links.length,
        commission_count: commissions.length,
        pending_commission_yuan: centsToYuan(pending),
        /** 达人贡献 ROI：累计 GMV / 累计佣金 */
        roi: pending > 0 ? Number((item.total_gmv_cent / pending).toFixed(2)) : null,
      };
    });
  },

  detail(id: number) {
    const influencer = affiliateRepo.findInfluencer(id);
    if (!influencer) {
      throw ApiError.notFound(`达人 ${id} 不存在`);
    }
    const links = affiliateRepo.links(id).map((link) => {
      const product = productRepo.findById(link.product_id);
      return {
        ...link,
        product_title: product?.title,
        gmv_yuan: centsToYuan(link.gmv_cent),
        cvr: link.clicks > 0 ? Number(((link.conversions / link.clicks) * 100).toFixed(2)) : 0,
      };
    });
    const commissions = affiliateRepo.listCommissions({ influencerId: id });
    return {
      ...influencer,
      links,
      commissions,
      summary: {
        linkCount: links.length,
        totalGmvYuan: centsToYuan(influencer.total_gmv_cent),
        pendingYuan: centsToYuan(commissions.filter((c) => c.status === 'PENDING').reduce((a, c) => a + c.commission_amount_cent, 0)),
        settledYuan: centsToYuan(commissions.filter((c) => c.status === 'SETTLED').reduce((a, c) => a + c.commission_amount_cent, 0)),
      },
    };
  },

  createInfluencer(input: { nickname: string; handle: string; followers: number; category: string; commissionRate?: number; region: string }) {
    if (!input.handle.startsWith('@')) {
      throw ApiError.badRequest('达人 handle 必须以 @ 开头');
    }
    if (affiliateRepo.findInfluencerByHandle(input.handle)) {
      throw ApiError.conflict(`达人 ${input.handle} 已存在`);
    }
    const id = affiliateRepo.createInfluencer({
      nickname: input.nickname,
      handle: input.handle,
      followers: input.followers,
      category: input.category,
      commissionRate: input.commissionRate ?? 0.1,
      region: input.region,
    });
    return this.detail(id);
  },

  /** 生成带货链接：短码形如 LK-US-AVA001，可带 UTM 参数用于渠道归因 */
  createLink(input: { influencerId: number; productId: number; campaign?: string }) {
    const influencer = affiliateRepo.findInfluencer(input.influencerId);
    if (!influencer) {
      throw ApiError.badRequest(`达人 ${input.influencerId} 不存在`);
    }
    if (!productRepo.findById(input.productId)) {
      throw ApiError.badRequest(`商品 ${input.productId} 不存在`);
    }
    const existing = affiliateRepo.links(input.influencerId).find((link) => link.product_id === input.productId);
    if (existing) {
      return existing;
    }
    const linkCode = generateLinkCode(influencer.region);
    const id = affiliateRepo.createLink({
      influencerId: input.influencerId,
      productId: input.productId,
      linkCode,
      utmSource: influencer.handle.replace('@', ''),
      utmCampaign: input.campaign,
    });
    return affiliateRepo.links(input.influencerId).find((link) => link.id === id);
  },

  listCommissions(filter: { influencerId?: number; status?: string } = {}) {
    return affiliateRepo.listCommissions(filter).map((record) => ({
      ...record,
      gmv_yuan: centsToYuan(record.gmv_cent),
      commission_yuan: centsToYuan(record.commission_amount_cent),
      commission_rate_percent: Number((record.commission_rate * 100).toFixed(2)),
    }));
  },

  summary() {
    const rows = affiliateRepo.commissionSummary();
    const map = Object.fromEntries(rows.map((row) => [row.status, row]));
    return {
      pending: { count: map.PENDING?.c ?? 0, amountYuan: centsToYuan(map.PENDING?.amount ?? 0) },
      confirmed: { count: map.CONFIRMED?.c ?? 0, amountYuan: centsToYuan(map.CONFIRMED?.amount ?? 0) },
      settled: { count: map.SETTLED?.c ?? 0, amountYuan: centsToYuan(map.SETTLED?.amount ?? 0) },
      totalAmountYuan: centsToYuan(rows.reduce((acc, row) => acc + row.amount, 0)),
    };
  },

  /**
   * 订单妥投后计提佣金：按商品佣金率（缺省用达人费率）计算，幂等键 (influencer, order)。
   * 真实业务里归因来自链接点击/优惠码，这里简化为"订单商品命中达人带货链接即归因"。
   */
  accrueForOrder(orderId: number) {
    const order = orderRepo.findById(orderId);
    if (!order) {
      throw ApiError.notFound(`订单 ${orderId} 不存在`);
    }
    if (order.status !== 'DELIVERED') {
      throw ApiError.conflict('只有已妥投（DELIVERED）的订单可以计提佣金');
    }
    const items = orderRepo.items(orderId);
    const created: Array<{ influencerId: number; commissionId: number; amountCent: number }> = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const link = affiliateRepo.links().find((row) => row.product_id === item.product_id);
      if (!link) continue;
      const influencer = affiliateRepo.findInfluencer(link.influencer_id);
      if (!influencer) continue;
      const rate = influencer.commission_rate;
      const gmvCent = item.subtotal_cent;
      const commissionCent = Math.round(gmvCent * rate);
      const { inserted, id } = affiliateRepo.insertCommissionIfAbsent({
        influencerId: influencer.id,
        orderId,
        linkId: link.id,
        gmvCent,
        commissionRate: rate,
        commissionAmountCent: commissionCent,
        currencyCode: order.currency_code,
      });
      if (inserted) {
        created.push({ influencerId: influencer.id, commissionId: id, amountCent: commissionCent });
      }
    }
    return { orderId, created, totalYuan: centsToYuan(created.reduce((acc, row) => acc + row.amountCent, 0)) };
  },
};
