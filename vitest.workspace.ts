import { totalmem } from 'node:os';
import { defineWorkspace } from 'vitest/config';

// 根据机器内存动态调整线程数（三档配置）
// < 8GB:  1 线程/项目 → 总 3 线程  (~1.5GB 测试内存)
// 8-16GB: 2 线程/项目 → 总 6 线程  (~3GB 测试内存)
// >= 16GB: 4 线程/项目 → 总 12 线程 (~6GB 测试内存)
const GB = 1024 * 1024 * 1024;
const systemMemory = totalmem();

const maxThreads = systemMemory >= 16 * GB ? 4 : systemMemory >= 8 * GB ? 2 : 1;

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
