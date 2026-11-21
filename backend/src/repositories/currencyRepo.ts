import { getDb } from '../db';
import type { Currency, ExchangeRate } from '../types';

export const currencyRepo = {
  list(): Currency[] {
    return getDb().prepare('SELECT * FROM currency ORDER BY code').all() as Currency[];
  },

  find(code: string): Currency | undefined {
    return getDb().prepare('SELECT * FROM currency WHERE code = ?').get(code) as Currency | undefined;
  },

  listRates(limit = 50): ExchangeRate[] {
    return getDb()
      .prepare('SELECT * FROM exchange_rate ORDER BY effective_date DESC, id DESC LIMIT ?')
      .all(limit) as ExchangeRate[];
  },

  findRateById(id: number): ExchangeRate | undefined {
    return getDb().prepare('SELECT * FROM exchange_rate WHERE id = ?').get(id) as ExchangeRate | undefined;
  },

  /** 取某货币对在指定日期（含）之前最新的一条汇率，实现"历史汇率快照"语义 */
  latestRate(base: string, quote: string, date: string): ExchangeRate | undefined {
    return getDb()
      .prepare(
        `SELECT * FROM exchange_rate
          WHERE base_currency = ? AND quote_currency = ? AND effective_date <= ?
          ORDER BY effective_date DESC, id DESC LIMIT 1`,
      )
      .get(base, quote, date) as ExchangeRate | undefined;
  },

  upsertRate(input: { baseCurrency: string; quoteCurrency: string; rate: number; effectiveDate: string; source?: string }) {
    const db = getDb();
    const existing = db
      .prepare(
        'SELECT id FROM exchange_rate WHERE base_currency = ? AND quote_currency = ? AND effective_date = ?',
      )
      .get(input.baseCurrency, input.quoteCurrency, input.effectiveDate) as { id: number } | undefined;
    if (existing) {
      db.prepare('UPDATE exchange_rate SET rate = ?, source = ? WHERE id = ?').run(
        input.rate,
        input.source ?? 'MANUAL',
        existing.id,
      );
      return existing.id;
    }
    const info = db
      .prepare(
        `INSERT INTO exchange_rate (base_currency, quote_currency, rate, effective_date, source)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.baseCurrency, input.quoteCurrency, input.rate, input.effectiveDate, input.source ?? 'MANUAL');
    return Number(info.lastInsertRowid);
  },

  updateRate(id: number, rate: number) {
    return getDb().prepare('UPDATE exchange_rate SET rate = ? WHERE id = ?').run(rate, id).changes;
  },
};
