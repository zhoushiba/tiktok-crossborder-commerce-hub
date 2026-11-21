# 部署与运行 · TikTok 跨境直播电商中台

## 1. 前置要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20（本项目实测 **v24.20.0**） | 后端与前端构建都需要 |
| npm | ≥ 10（实测 11.19.0） | Windows 下请使用 `npm.cmd` |
| 操作系统 | Windows / macOS / Linux | 本地默认 SQLite，无需安装数据库 |
| （可选）Docker | 24+ | 用于 `docker-compose.yml` 的三服务编排 |

> Windows PowerShell 注意：执行 npm 脚本必须写 `npm.cmd`，否则会被执行策略拦截。

## 2. 目录与端口

```
tiktok-crossborder-commerce-hub/
├── backend/     API 服务（默认 3000）+ Mock 网关（默认 8090）
├── frontend/    前端（dev 5173，构建产物 dist/）
├── db/          schema.sql / seed.sql / mysql/schema.sql
├── docs/        文档与截图
└── scripts/     serve-dist.mjs（截图/验收用静态服务器）
```

| 服务 | 默认端口 | 覆盖方式 | 健康检查 |
| --- | --- | --- | --- |
| API | 3000 | `API_PORT` | `GET /api/system/health` |
| Mock 网关 | 8090 | `MOCK_PORT` | `GET /api/v2/health` |
| 前端 dev | 5173 | `vite.config.ts` | 浏览器访问 |
| 静态预览 | 4173 | `node scripts/serve-dist.mjs 4173` | `GET /` |

> **本机实测说明**：这台机器 3000 端口被另一个进程占用，因此演示时用 `API_PORT=3100`、`MOCK_PORT=8091`，前端构建时用 `VITE_API_BASE_URL=http://127.0.0.1:3100/api`。换到干净机器可以直接用默认端口。

## 3. 本地运行（已实测通过）

### 3.1 后端

```powershell
cd backend
npm.cmd install                 # 219 个包，约 5 分钟（better-sqlite3 预编译二进制）
npm.cmd run db:reset            # 可选：重建库 + 灌种子，并打印各表行数
npm.cmd run dev                 # tsx watch，改代码自动重启
# 或生产模式
npm.cmd run build               # tsc → dist/
npm.cmd start                   # node dist/index.js
```

启动日志会打印两个地址：

```
[api]  http://127.0.0.1:3000  (docs: /api/docs)
[mock] http://127.0.0.1:8090  (TikTok Shop mock gateway)
```

改端口：

```powershell
$env:API_PORT="3100"; $env:MOCK_PORT="8091"; $env:TIKTOK_API_BASE="http://127.0.0.1:8091"; npm.cmd start
```

### 3.2 前端

```powershell
cd frontend
npm.cmd install
npm.cmd run dev                 # http://127.0.0.1:5173（/api 已代理到 3000）
```

**构建与预览**（截图、验收、静态托管都用这套）：

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:3100/api"   # 若 API 用了非默认端口
npm.cmd run build                                     # 产物在 frontend/dist
cd ..
node scripts/serve-dist.mjs 4173                      # http://127.0.0.1:4173
```

`vite.config.ts` 里 `base: './'`，所以 `dist/` 可以放在任意子路径下（Nginx 子目录、对象存储、本地文件服务器都行）。路由使用 **hash 模式**，刷新任何页面都不会 404。

### 3.3 一条命令起两个后端服务

`backend/src/index.ts` 同时监听 API 与 Mock，所以 `npm start` 之后：

- 业务接口：`http://127.0.0.1:3000/api/...`
- Mock 网关：`http://127.0.0.1:8090/api/v2/...`
- 接口文档：`http://127.0.0.1:3000/api/docs`

如果只想跑网关（例如给别的服务联调）：`npm.cmd run mock`。

## 4. 环境变量

复制 `.env.example` 为 `backend/.env` 后按需修改（`dotenv` 在 `backend/src/config/index.ts` 中加载）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | `test` 时关闭访问日志 |
| `API_PORT` | `3000` | API 端口 |
| `MOCK_PORT` | `8090` | Mock 网关端口 |
| `DB_FILE` | `backend/data/tiktok-hub.db` | SQLite 文件路径，`:memory:` 为内存库 |
| `DB_SCHEMA_FILE` | `db/schema.sql` | 建表脚本 |
| `DB_SEED_FILE` | `db/seed.sql` | 种子脚本 |
| `JWT_SECRET` | 开发默认值 | **生产必须改**，建议 32 位以上随机串 |
| `JWT_EXPIRES_IN` | `12h` | token 有效期 |
| `TIKTOK_API_BASE` | `http://127.0.0.1:8090` | 平台网关地址 |
| `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET` | `tt-app-key-demo` / `tt-app-secret-demo` | 签名凭证（生产用平台下发） |
| `TIKTOK_TIMEOUT_MS` | `8000` | 单次请求超时 |
| `TIKTOK_MAX_PAGES` | `20` | 单次同步最多翻页数 |
| `TIKTOK_PAGE_SIZE` | `50` | 单页订单数 |
| `BASE_CURRENCY` | `CNY` | 本位币 |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `600` | 限流窗口与阈值 |
| `LOG_LEVEL` | `info` | 日志级别 |

前端只需一个变量（构建时注入）：`VITE_API_BASE_URL`，默认 `/api`（配合 Nginx 反代）。

## 5. 数据库

### 5.1 SQLite（默认，零依赖）

- 首次启动会自动建库、执行 `db/schema.sql`；若 `sys_user` 为空则执行 `db/seed.sql`；
- 重置：`npm.cmd run db:reset`（删除 `DB_FILE` 后重建，等价于「回到出厂状态」）；
- 备份：直接复制 `backend/data/tiktok-hub.db`（WAL 模式下建议先 `PRAGMA wal_checkpoint(TRUNCATE)`，或停服复制）。

### 5.2 MySQL 8（可选）

```sql
CREATE DATABASE tiktok_hub DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_general_ci;
-- 然后执行 db/mysql/schema.sql
```

切换步骤：

1. 用 `db/mysql/schema.sql` 建表；
2. 在 `backend/src/db/index.ts` 旁增加 mysql2 连接实现（仓储接口不变）；
3. 把 `ON CONFLICT DO NOTHING` 改为 `INSERT IGNORE`（差异清单见 `docs/database.md` §7）；
4. 时间字段由 `TEXT` 改 `DATETIME`，连接串加 `timezone=Z`。

> 本项目**未在本机实测 MySQL 分支**（机器上没有 MySQL/Docker），这句话在 README「已知限制」里也写明了。

## 6. Docker Compose（无法本机执行，但已按可运行形态编写）

```bash
docker compose up -d --build
# api   → http://localhost:3000   （Swagger: /api/docs）
# mock  → http://localhost:8090   （/api/v2/health）
# web   → http://localhost:4173
```

> 容器内 `api` 用服务名访问 Mock（`TIKTOK_API_BASE=http://mock:8090`），
> 前端构建期把接口地址写成同源 `/api`，由 Nginx 反代到 `api:3000`。
> 上面是**容器内**的端口；本机直接跑 Node 时因为 3000 被占用改用 3100/8091（见 §3）。

`docker-compose.yml` 里包含三个服务：

| 服务 | 镜像 | 说明 |
| --- | --- | --- |
| `api` | 由 `backend/Dockerfile` 构建 | `node:20-bookworm-slim` 多阶段构建，命名卷 `sqlite-data` 持久化 SQLite |
| `mock` | 同上（`command` 覆盖成 `dist/mock/standalone.js`） | 单独跑 Mock 网关 |
| `web` | 由 `frontend/Dockerfile` 构建 | 多阶段构建，Nginx 托管 `dist/` 并反代 `/api` |

> 基础镜像刻意不用 alpine：`better-sqlite3` 的预编译二进制走 glibc，用
> `bookworm-slim` 可以省掉 python3/make/g++ 编译链；若坚持 alpine，需要
> 在 Dockerfile 里补装构建工具。

> 由于本机没有 Docker，这些文件**没有经过实际构建验证**，属于「按标准写法交付、待 CI 验证」的部分，已在 README 已知限制中声明。

## 7. 生产注意事项

1. **密钥**：`JWT_SECRET`、`TIKTOK_APP_SECRET` 必须走环境变量/密钥管理，禁止进仓库（`.env` 已 gitignore）。
2. **反向代理**（Nginx 示例）：

```nginx
server {
  listen 80;
  server_name hub.example.com;

  root /var/www/tiktok-hub;
  index index.html;

  location / { try_files $uri $uri/ /index.html; }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Request-Id $request_id;
  }
}
```

3. **进程守护**：`pm2 start dist/index.js --name tiktok-hub` 或 systemd unit；单机 SQLite 只能单写，**不要多实例共享同一个 db 文件**。
4. **日志**：当前访问日志打 stdout，生产建议接 `pino` + 采集（ES/Loki），并按 `requestId` 关联。
5. **限流**：内存计数只对单实例有效；多实例请换 Redis 令牌桶（roadmap 已列）。
6. **备份**：SQLite 每日快照 + 异地存放；切 MySQL 后用 `mysqldump --single-transaction`。
7. **监控**：`/api/system/health` 作为存活探针，`/api/dashboard/todo` 的计数可接告警（超时未发货、异常物流堆积）。
8. **时区**：服务端统一 UTC；前端展示用站点 `timezone`；MySQL 连接需固定 `+00:00`，否则日报会错位。

## 8. 截图复现（验收用）

```powershell
# 1) 起后端（3100/8091）与静态服务（4173）
cd backend; $env:API_PORT="3100"; $env:MOCK_PORT="8091"; $env:TIKTOK_API_BASE="http://127.0.0.1:8091"; node dist/index.js
# 另开一个终端
node scripts/serve-dist.mjs 4173

# 2) Edge headless 截图（?demo=1 会自动以 admin 登录，避免截到登录墙）
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
& $edge --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --virtual-time-budget=12000 `
  "--screenshot=$PWD\docs\screenshots\02-dashboard.png" "http://127.0.0.1:4173/#/overview?demo=1"
```

已生成的 3 张图：`docs/screenshots/01-login.png`、`02-dashboard.png`、`03-orders.png`。

## 9. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `EADDRINUSE :::3000` | 端口被占 | `$env:API_PORT="3100"`，前端相应设置 `VITE_API_BASE_URL` |
| 前端页面数据为空且控制台 401 | token 过期（12h） | 重新登录；或访问 `#/overview?demo=1` 自动登录 |
| `better-sqlite3` 安装失败 | 缺预编译二进制 | 安装 VS Build Tools，或换 Node 20/22 LTS |
| 同步订单返回 `code=40100` | Mock 网关签名或时间戳不匹配 | 检查 `TIKTOK_APP_SECRET`；确认系统时间准确（±300s） |
| 同步一直 `duplicated` | 幂等生效 | 正常现象，说明「重复拉取不会重复入库」 |
| 中文乱码（Excel 打开 CSV） | 缺 BOM | 项目已加 `\uFEFF`；自定义导出注意保留 |
