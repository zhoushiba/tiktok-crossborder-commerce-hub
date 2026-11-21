import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    // 集成测试会起 Mock 网关并共享内存库，串行执行更稳定
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
