import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@trapmap/contracts': resolve(__dirname, '../contracts/src/index.ts'),
      '@trapmap/server': resolve(__dirname, 'src'),
    },
  },
});
