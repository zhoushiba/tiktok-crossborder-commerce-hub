import { getDb } from '../db';
import type { Shop, ShopSite } from '../types';

export const shopRepo = {
  list(): Shop[] {
    return getDb().prepare('SELECT * FROM shop ORDER BY id').all() as Shop[];
  },

  findById(id: number): Shop | undefined {
    return getDb().prepare('SELECT * FROM shop WHERE id = ?').get(id) as Shop | undefined;
  },

  listSites(shopId?: number): ShopSite[] {
    const db = getDb();
    if (shopId) {
      return db.prepare('SELECT * FROM shop_site WHERE shop_id = ? ORDER BY id').all(shopId) as ShopSite[];
    }
    return db.prepare('SELECT * FROM shop_site ORDER BY shop_id, id').all() as ShopSite[];
  },

  findSiteByCode(code: string): ShopSite | undefined {
    return getDb().prepare('SELECT * FROM shop_site WHERE site_code = ?').get(code) as ShopSite | undefined;
  },

  create(input: { shopName: string; region: string; currencyCode: string; timezone: string; platform?: string }) {
    const info = getDb()
      .prepare(
        `INSERT INTO shop (shop_name, platform, region, currency_code, timezone, app_key, app_secret, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      )
      .run(
        input.shopName,
        input.platform ?? 'TIKTOK_SHOP',
        input.region,
        input.currencyCode,
        input.timezone,
        process.env.TIKTOK_APP_KEY ?? 'tt-app-key-demo',
        null,
      );
    return Number(info.lastInsertRowid);
  },

  /** 模拟 OAuth 授权：写入 access_token 与过期时间，状态置 ACTIVE */
  authorize(shopId: number, accessToken: string, expiresAt: string) {
    return getDb()
      .prepare(
        `UPDATE shop SET access_token = ?, token_expires_at = ?, status = 'ACTIVE',
           authorized_at = datetime('now'), app_secret = COALESCE(app_secret, ?) WHERE id = ?`,
      )
      .run(accessToken, expiresAt, process.env.TIKTOK_APP_SECRET ?? 'tt-app-secret-demo', shopId).changes;
  },

  updateStatus(shopId: number, status: string) {
    return getDb().prepare('UPDATE shop SET status = ? WHERE id = ?').run(status, shopId).changes;
  },

  createSite(input: { shopId: number; siteCode: string; siteName: string; country: string; currencyCode: string; timezone: string }) {
    const info = getDb()
      .prepare(
        `INSERT INTO shop_site (shop_id, site_code, site_name, country, currency_code, timezone)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.shopId, input.siteCode, input.siteName, input.country, input.currencyCode, input.timezone);
    return Number(info.lastInsertRowid);
  },
};
