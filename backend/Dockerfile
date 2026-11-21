# ===========================================================================
# 后端镜像（多阶段构建）
# ---------------------------------------------------------------------------
# 构建上下文是**仓库根目录**（docker-compose.yml 里 context: .），
# 因为运行期需要 db/schema.sql 与 db/seed.sql：
#
#   docker build -f backend/Dockerfile -t tiktok-hub-api:1.0.0 .
#
# 基础镜像用 bookworm-slim（glibc）而不是 alpine：better-sqlite3 的
# 预编译二进制在 glibc 上可直接复用，省掉 python3/make/g++ 编译链。
# ===========================================================================

# ---------- 阶段 1：安装全部依赖并编译 TypeScript ----------
FROM node:20-bookworm-slim AS build

WORKDIR /app/backend

# 先只拷贝依赖清单，利用 Docker 层缓存
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---------- 阶段 2：只装生产依赖，产出精简运行镜像 ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TZ=UTC \
    API_PORT=3000 \
    MOCK_PORT=8090 \
    DB_FILE=/app/backend/data/tiktok-hub.db \
    DB_SCHEMA_FILE=/app/db/schema.sql \
    DB_SEED_FILE=/app/db/seed.sql

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --from=build /app/backend/dist ./dist

# 建表/种子脚本按仓库结构放在 /app/db，与 dist/config 里的 workspaceRoot 推导一致
COPY db /app/db

# SQLite 数据目录（compose 里挂命名卷，保证重启不丢数据）
RUN mkdir -p /app/backend/data

EXPOSE 3000 8090

# 默认启动 API（同时也会拉起内置 Mock）；compose 里 mock 服务用 command 覆盖成 standalone
CMD ["node", "dist/index.js"]
