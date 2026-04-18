import { totalmem } from 'node:os';
import { defineWorkspace } from 'vitest/config';

// 根据机器内存动态调整线程数：每 8GB 增加一线程
// 8GB:   1 线程/项目 → 总 3 线程  (~1.5GB 测试内存)
// 16GB:  2 线程/项目 → 总 6 线程  (~3GB 测试内存)
// 24GB:  3 线程/项目 → 总 9 线程  (~4.5GB 测试内存)
// 32GB+: 4 线程/项目 → 总 12 线程 (~6GB 测试内存)
const GB = 1024 * 1024 * 1024;
const systemMemory = totalmem();

const maxThreads = Math.max(1, Math.min(4, Math.floor(systemMemory / (8 * GB))));

export default defineWorkspace([
  {
    test: {
      include: ['packages/**/*.test.ts'],
      pool: 'threads',
      poolOptions: {
        threads: {
          maxThreads,
          minThreads: 1,
        },
      },
    },
  },
]);
