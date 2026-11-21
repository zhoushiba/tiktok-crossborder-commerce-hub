import { settlementRepo } from '../repositories/settlementRepo';
import { affiliateRepo } from '../repositories/affiliateRepo';
import { currencyRepo } from '../repositories/currencyRepo';
import { withTransaction } from '../db';
import { ApiError } from '../utils/response';
import { centsToYuan, convertCents } from '../utils/money';
import { nextBusinessNo } from '../utils/ids';
import { monthKey } from '../utils/pagination';

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING'],
  PENDING: ['APPROVED', 'DRAFT'],
  APPROVED: ['PAID'],
  PAID: [],
};

export const settlementService = {
  list(filter: { influencerId?: number; status?: string } = {}) {
    return (settlementRepo.list(filter) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      total_gmv_yuan: centsToYuan(Number(row.total_gmv_cent ?? 0)),
      commission_yuan: centsToYuan(Number(row.commission_amount_cent ?? 0)),
      base_amount_yuan: centsToYuan(Number(row.base_amount_cent ?? 0)),
    }));
  },

  detail(id: number) {
    const settlement = settlementRepo.findById(id);
    if (!settlement) {
      throw ApiError.notFound(`结算单 ${id} 不存在`);
    }
    return {
      ...settlement,
      total_gmv_yuan: centsToYuan(settlement.total_gmv_cent),
      commission_yuan: centsToYuan(settlement.commission_amount_cent),
      base_amount_yuan: centsToYuan(settlement.base_amount_cent),
      items: settlementRepo.items(id),
    };
  },

  /**
   * 生成结算单：拉取达人指定周期内所有 PENDING 佣金，
   * 汇总 GMV 与佣金后按结算日汇率折算成基准币（CNY），并把佣金置为 CONFIRMED 防止重复结算。
   */
  create(input: { influencerId: number; periodStart: string; periodEnd: string; remark?: string }) {
    if (input.periodStart > input.periodEnd) {
      throw ApiError.badRequest('结算周期开始日期不能晚于结束日期');
    }
    const influencer = affiliateRepo.findInfluencer(input.influencerId);
    if (!influencer) {
      throw ApiError.notFound(`达人 ${input.influencerId} 不存在`);
    }
    const pending = affiliateRepo.pendingCommissions(input.influencerId, input.periodStart, input.periodEnd);
    if (!pending.length) {
      throw ApiError.conflict('该周期内没有待结算佣金');
    }
    const currencyCode = pending[0].currency_code;
    const totalGmv = pending.reduce((acc, row) => acc + row.gmv_cent, 0);
    const totalCommission = pending.reduce((acc, row) => acc + row.commission_amount_cent, 0);
    const rate = currencyRepo.latestRate(currencyCode, 'CNY', input.periodEnd);
    if (!rate) {
      throw ApiError.badRequest(`缺少 ${currencyCode}/CNY 汇率，无法生成结算单`);
    }
    const settlementNo = nextBusinessNo('ST', 'settlement', 'settlement_no');
    const settlementId = withTransaction(() => {
      const id = settlementRepo.create({
        settlementNo,
        influencerId: input.influencerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        totalGmvCent: totalGmv,
        commissionAmountCent: totalCommission,
        currencyCode,
        exchangeRateId: rate.id,
        baseAmountCent: convertCents(totalCommission, rate.rate),
        remark: input.remark,
      });
      for (const commission of pending) {
        settlementRepo.addItem(id, commission.id, commission.commission_amount_cent);
      }
      affiliateRepo.markCommissionsStatus(
        pending.map((row) => row.id),
        'CONFIRMED',
      );
      return id;
    });
    return this.detail(settlementId);
  },

  /**
   * 状态流转：DRAFT → PENDING → APPROVED → PAID；
   * 置 PAID 时把关联佣金同步为 SETTLED，形成"佣金 → 结算单 → 已打款"的闭环。
   */
  updateStatus(id: number, status: string) {
    const settlement = settlementRepo.findById(id);
    if (!settlement) {
      throw ApiError.notFound(`结算单 ${id} 不存在`);
    }
    const allowed = TRANSITIONS[settlement.status] ?? [];
    if (!allowed.includes(status)) {
      throw ApiError.conflict(`结算单状态 ${settlement.status} 不能流转到 ${status}，允许：${allowed.join(' / ') || '无'}`);
    }
    withTransaction(() => {
      settlementRepo.updateStatus(id, status);
      const itemIds = (settlementRepo.items(id) as Array<{ commission_id: number }>).map((row) => row.commission_id);
      if (status === 'PAID') {
        affiliateRepo.markCommissionsStatus(itemIds, 'SETTLED');
      } else if (status === 'DRAFT') {
        affiliateRepo.markCommissionsStatus(itemIds, 'PENDING');
      }
    });
    return this.detail(id);
  },

  summary() {
    const rows = settlementRepo.list() as Array<Record<string, unknown>>;
    const byStatus = new Map<string, { count: number; amountCent: number }>();
    for (const row of rows) {
      const status = String(row.status);
      const current = byStatus.get(status) ?? { count: 0, amountCent: 0 };
      current.count += 1;
      current.amountCent += Number(row.commission_amount_cent ?? 0);
      byStatus.set(status, current);
    }
    return {
      total: rows.length,
      byStatus: [...byStatus.entries()].map(([status, value]) => ({
        status,
        count: value.count,
        amountYuan: centsToYuan(value.amountCent),
      })),
      currentMonth: monthKey(new Date()),
    };
  },
};
