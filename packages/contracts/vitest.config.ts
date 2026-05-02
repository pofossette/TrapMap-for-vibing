import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // 使用 forks 池，更稳定
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    maxConcurrency: 1,
    sequence: {
      concurrent: false,
    },
  },
});
