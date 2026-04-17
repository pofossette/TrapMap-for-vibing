import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      include: ['packages/**/*.test.ts'],
      pool: 'threads',
      poolOptions: {
        threads: {
          // 限制线程数，避免内存爆炸（默认会用满所有 CPU 核心）
          // 3 个包 × 2 线程 = 最多 6 个并发线程，比默认的 24 个更可控
          maxThreads: 2,
          minThreads: 1,
        },
      },
    },
  },
]);
