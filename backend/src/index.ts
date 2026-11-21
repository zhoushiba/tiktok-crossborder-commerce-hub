import { createApp } from './app';
import { createMockApp } from './mock/app';
import { config } from './config';
import { initDatabase, closeDb, getDb } from './db';

/**
 * 同时启动两个服务：
 * - API 服务（默认 3000）：业务接口 + Swagger 文档
 * - TikTok Shop Mock 网关（默认 8090）：模拟开放平台，供订单同步联调
 */
function main(): void {
  initDatabase();
  const db = getDb();
  const shopCount = (db.prepare('SELECT COUNT(1) AS c FROM shop').get() as { c: number }).c;

  const apiApp = createApp();
  const apiServer = apiApp.listen(config.apiPort, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] 服务已启动 http://localhost:${config.apiPort}  (docs: /api/docs, shops: ${shopCount})`);
  });

  const mockApp = createMockApp();
  const mockServer = mockApp.listen(config.mockPort, () => {
    // eslint-disable-next-line no-console
    console.log(`[mock] TikTok Shop 开放平台网关已启动 http://localhost:${config.mockPort}`);
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[api] 收到 ${signal}，正在关闭...`);
    apiServer.close(() => {
      mockServer.close(() => {
        closeDb();
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
