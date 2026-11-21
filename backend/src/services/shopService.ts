import { shopRepo } from '../repositories/shopRepo';
import { orderRepo } from '../repositories/orderRepo';
import { ApiError } from '../utils/response';
import { toUtcString, addDays } from '../utils/datetime';

const REGION_TIMEZONE: Record<string, string> = {
  US: 'America/Los_Angeles',
  UK: 'Europe/London',
  SEA: 'Asia/Singapore',
};

export const shopService = {
  /** 店铺列表附带站点与今日订单统计，供"店铺与多站点"页面直接渲染 */
  list() {
    const shops = shopRepo.list();
    const counts = orderRepo.countByShopAndStatus();
    return shops.map((shop) => {
      const sites = shopRepo.listSites(shop.id);
      const related = counts.filter((row) => row.shop_id === shop.id);
      return {
        ...shop,
        app_secret: shop.app_secret ? '******' : null,
        access_token: shop.access_token ? '******' : null,
        siteCount: sites.length,
        sites,
        orderCount: related.reduce((acc, row) => acc + row.c, 0),
        pendingCount: related.filter((row) => row.status === 'PAID').reduce((acc, row) => acc + row.c, 0),
        tokenValid: shop.token_expires_at ? new Date(shop.token_expires_at.replace(' ', 'T') + 'Z') > new Date() : false,
      };
    });
  },

  detail(id: number) {
    const shop = shopRepo.findById(id);
    if (!shop) {
      throw ApiError.notFound(`店铺 ${id} 不存在`);
    }
    return {
      ...shop,
      app_secret: shop.app_secret ? '******' : null,
      access_token: shop.access_token ? '******' : null,
      sites: shopRepo.listSites(id),
    };
  },

  create(input: { shopName: string; region: string; currencyCode: string; timezone?: string; siteCode?: string; siteName?: string; country?: string }) {
    if (!['US', 'UK', 'SEA'].includes(input.region)) {
      throw ApiError.badRequest('region 仅支持 US / UK / SEA');
    }
    const id = shopRepo.create({
      shopName: input.shopName,
      region: input.region,
      currencyCode: input.currencyCode,
      timezone: input.timezone ?? REGION_TIMEZONE[input.region],
    });
    if (input.siteCode) {
      shopRepo.createSite({
        shopId: id,
        siteCode: input.siteCode,
        siteName: input.siteName ?? `${input.shopName} 主站`,
        country: input.country ?? input.region,
        currencyCode: input.currencyCode,
        timezone: input.timezone ?? REGION_TIMEZONE[input.region],
      });
    }
    return this.detail(id);
  },

  /** 模拟 TikTok OAuth 授权回调：写入 token 并把店铺置为 ACTIVE */
  authorize(id: number) {
    const shop = shopRepo.findById(id);
    if (!shop) {
      throw ApiError.notFound(`店铺 ${id} 不存在`);
    }
    const expiresAt = `${addDays(toUtcString(new Date()).slice(0, 10), 30)} 00:00:00`;
    const fakeToken = `act.demo.${Buffer.from(`${shop.id}:${Date.now()}`).toString('base64url').slice(0, 24)}`;
    shopRepo.authorize(id, fakeToken, expiresAt);
    return { shopId: id, status: 'ACTIVE', tokenExpiresAt: expiresAt };
  },

  updateStatus(id: number, status: string) {
    if (!['ACTIVE', 'PAUSED', 'EXPIRED'].includes(status)) {
      throw ApiError.badRequest('status 仅支持 ACTIVE / PAUSED / EXPIRED');
    }
    const changes = shopRepo.updateStatus(id, status);
    if (!changes) {
      throw ApiError.notFound(`店铺 ${id} 不存在`);
    }
    return this.detail(id);
  },

  sites(shopId?: number) {
    return shopRepo.listSites(shopId);
  },
};
