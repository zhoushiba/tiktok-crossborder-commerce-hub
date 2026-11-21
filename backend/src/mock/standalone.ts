import { createMockApp } from './app';
import { config } from '../config';

/** 单独启动 Mock 网关（npm run mock），便于把 API 服务部署到别处做联调 */
const app = createMockApp();
app.listen(config.mockPort, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock] TikTok Shop 开放平台网关已启动 http://localhost:${config.mockPort}`);
});
