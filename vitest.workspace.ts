import { totalmem } from 'node:os';
import { defineWorkspace } from 'vitest/config';

// 根据机器内存动态调整线程数
// < 16GB: 1 线程/项目, >= 16GB: 2 线程/项目
const MEMORY_16GB = 16 * 1024 * 1024 * 1024;
const maxThreads = totalmem() >= MEMORY_16GB ? 2 : 1;

export default defineWorkspace([
  {
    test: {
      include: ['packages/**/*.test.ts'],
      pool: 'threads',
      poolOptions: {
        threads: {
          // 动态限制：低内存机器(1线程) vs 高内存机器(2线程)
          // 3 个包 × maxThreads = 总并发线程数
          maxThreads,
          minThreads: 1,
        },
      },
    },
  },
]);
