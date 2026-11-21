import { currencyRepo } from '../repositories/currencyRepo';
import { ApiError } from '../utils/response';
import { convertCents } from '../utils/money';
import { nowUtc } from '../utils/datetime';

export const currencyService = {
  listCurrencies() {
    return currencyRepo.list();
  },

  listRates(limit?: number) {
    const rates = currencyRepo.listRates(limit);
    return rates.map((rate) => ({
      ...rate,
      pair: `${rate.base_currency}/${rate.quote_currency}`,
      /** 反向汇率，页面展示"1 CNY = ? USD"时使用 */
      inverse: rate.rate > 0 ? Number((1 / rate.rate).toFixed(6)) : null,
    }));
  },

  /**
   * 实时换算：金额以"分"为单位传入，内部按当日最新有效汇率折算，
   * 返回折算结果与所用汇率快照，便于前端展示"按 2026-11-20 汇率"。
   */
  convert(input: { amountCent: number; base: string; quote: string; date?: string }) {
    if (input.base === input.quote) {
      return { amountCent: input.amountCent, rate: 1, rateDate: null, base: input.base, quote: input.quote };
    }
    const date = input.date ?? nowUtc().slice(0, 10);
    let rate = currencyRepo.latestRate(input.base, input.quote, date);
    let inverted = false;
    if (!rate) {
      rate = currencyRepo.latestRate(input.quote, input.base, date);
      inverted = true;
    }
    if (!rate) {
      throw ApiError.notFound(`缺少 ${input.base}/${input.quote} 在 ${date} 之前的汇率数据`);
    }
    const effectiveRate = inverted ? 1 / rate.rate : rate.rate;
    return {
      amountCent: convertCents(input.amountCent, effectiveRate),
      rate: Number(effectiveRate.toFixed(6)),
      rateDate: rate.effective_date,
      base: input.base,
      quote: input.quote,
      inverted,
    };
  },

  upsertRate(input: { baseCurrency: string; quoteCurrency: string; rate: number; effectiveDate: string; source?: string }) {
    if (input.baseCurrency === input.quoteCurrency) {
      throw ApiError.badRequest('基准货币与目标货币不能相同');
    }
    if (!(input.rate > 0)) {
      throw ApiError.badRequest('汇率必须大于 0');
    }
    const id = currencyRepo.upsertRate(input);
    return currencyRepo.findRateById(id);
  },

  updateRate(id: number, rate: number) {
    if (!(rate > 0)) {
      throw ApiError.badRequest('汇率必须大于 0');
    }
    const changes = currencyRepo.updateRate(id, rate);
    if (!changes) {
      throw ApiError.notFound(`汇率记录 ${id} 不存在`);
    }
    return currencyRepo.findRateById(id);
  },
};
