# ===========================================================================
# 前端镜像（构建产物 + Nginx）
# ---------------------------------------------------------------------------
# 构建上下文是**仓库根目录**：
#
#   docker build -f frontend/Dockerfile \
#     --build-arg VITE_API_BASE_URL=/api -t tiktok-hub-web:1.0.0 .
#
# 产物是纯静态文件，hash 路由（createWebHashHistory）因此不需要
# history fallback 的特殊处理；/api 由 Nginx 反向代理到 api 服务。
# ===========================================================================

# ---------- 阶段 1：构建静态产物 ----------
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY frontend/ ./

# 构建期注入后端地址；compose 里传 /api 走同源反代
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---------- 阶段 2：Nginx 托管 ----------
FROM nginx:1.27-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
