import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

// 项目根目录（backend 的上一级），db/schema.sql 等文件从仓库根目录读取
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

dotenv.config({ path: path.join(workspaceRoot, '.env') });
dotenv.config();

export interface AppConfig {
  env: string;
  apiPort: number;
  mockPort: number;
  dbFile: string;
  schemaFile: string;
  seedFile: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  tiktok: {
    baseUrl: string;
    appKey: string;
    appSecret: string;
    timeoutMs: number;
    maxPages: number;
    pageSize: number;
  };
  baseCurrency: string;
  rateLimit: { windowMs: number; max: number };
  logLevel: string;
}

const workspace = workspaceRoot;

export const config: AppConfig = {
  env: process.env.NODE_ENV || 'development',
  apiPort: Number(process.env.API_PORT || 3000),
  mockPort: Number(process.env.MOCK_PORT || 8090),
  // 默认落在 backend/data 下，便于本地演示；测试会替换成内存库
  dbFile: process.env.DB_FILE || path.join(__dirname, '..', '..', 'data', 'tiktok-hub.db'),
  schemaFile: process.env.DB_SCHEMA_FILE || path.join(workspace, 'db', 'schema.sql'),
  seedFile: process.env.DB_SEED_FILE || path.join(workspace, 'db', 'seed.sql'),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  tiktok: {
    baseUrl: process.env.TIKTOK_API_BASE || `http://127.0.0.1:${process.env.MOCK_PORT || 8090}`,
    appKey: process.env.TIKTOK_APP_KEY || 'tt-app-key-demo',
    appSecret: process.env.TIKTOK_APP_SECRET || 'tt-app-secret-demo',
    timeoutMs: Number(process.env.TIKTOK_TIMEOUT_MS || 5000),
    maxPages: Number(process.env.TIKTOK_MAX_PAGES || 20),
    pageSize: Number(process.env.TIKTOK_PAGE_SIZE || 50),
  },
  // 结算本位币（人民币），汇率表以 USD 为枢纽
  baseCurrency: process.env.BASE_CURRENCY || 'CNY',
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(process.env.RATE_LIMIT_MAX || 600),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

export const workspaceRootDir = workspaceRoot;
