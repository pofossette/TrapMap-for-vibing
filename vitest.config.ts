import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'contracts',
          root: './packages/contracts',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: './packages/server',
          include: ['src/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@trapmap/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
          },
        },
      },
      {
        test: {
          name: 'cli',
          root: './packages/cli',
          include: ['src/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@trapmap/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
          },
        },
      },
      {
        test: {
          name: 'evals',
          root: './evals',
          include: ['**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@trapmap/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
          },
        },
      },
    ],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
