import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['benchmarks/harness/**/*.bench.ts'],
    benchmark: {
      include: ['benchmarks/harness/**/*.bench.ts'],
      reporters: ['json', 'verbose'],
      outputJson: 'benchmarks/results/bench-node.json',
    },
  },
  resolve: {
    alias: {
      '@trapmap/lib': resolve(__dirname, '../../packages/lib/src/index.ts'),
      '@trapmap/backend-core': resolve(__dirname, '../../packages/backend-core/src/index.ts'),
      '@trapmap/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
});
