import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'contracts-compliance',
          root: './packages/contracts',
          include: ['src/**/*.compliance.test.ts'],
        },
      },
      {
        test: {
          name: 'server-compliance',
          root: './packages/server',
          include: ['src/**/*.compliance.test.ts'],
        },
        resolve: {
          alias: {
            '@trapmap/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
          },
        },
      },
      {
        test: {
          name: 'cli-compliance',
          root: './packages/cli',
          include: ['src/**/*.compliance.test.ts'],
        },
        resolve: {
          alias: {
            '@trapmap/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
          },
        },
      },
      {
        test: {
          name: 'evals-compliance',
          root: './evals',
          include: ['**/*.compliance.test.ts'],
        },
        resolve: {
          alias: {
            '@trapmap/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
          },
        },
      },
    ],
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
