import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootVitestMaxWorkers = process.env.VITEST_MAX_WORKERS ?? '50%';
const rootVitestMinWorkers = process.env.VITEST_MIN_WORKERS ?? '1';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'scripts',
          root: './scripts',
          include: ['__tests__/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'contracts',
          root: './packages/contracts',
          include: ['src/**/*.test.ts'],

          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**', '**/node_modules/**'],
            thresholds: {
              lines: 70,
              functions: 70,
              branches: 60,
              statements: 70,
            },
          },
        },
      },
      {
        test: {
          name: 'server',
          root: './packages/server',
          include: ['src/**/*.test.ts'],

          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**', '**/node_modules/**'],
            thresholds: {
              lines: 70,
              functions: 70,
              branches: 60,
              statements: 70,
            },
          },
        },
        resolve: {
          alias: [
            {
              find: /^@trapmap\/contracts\/evals$/,
              replacement: resolve(__dirname, './packages/contracts/src/domain/evals/index.ts'),
            },
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
            {
              find: /^@trapmap\/server\/(.+)$/,
              replacement: resolve(__dirname, './packages/server/src/$1'),
            },
          ],
        },
      },
      {
        test: {
          name: 'backend-core',
          root: './packages/backend-core',
          include: ['src/**/*.test.ts'],
        },
        resolve: {
          alias: [
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
          ],
        },
      },
      {
        test: {
          name: 'client-core',
          root: './packages/client-core',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'cli',
          root: './packages/cli',
          include: ['src/**/*.test.ts'],

          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**', '**/node_modules/**'],
            thresholds: {
              lines: 70,
              functions: 70,
              branches: 60,
              statements: 70,
            },
          },
        },
        resolve: {
          alias: [
            {
              find: /^@trapmap\/contracts\/evals$/,
              replacement: resolve(__dirname, './packages/contracts/src/domain/evals/index.ts'),
            },
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
            {
              find: /^@trapmap\/cli\/(.+)$/,
              replacement: resolve(__dirname, './packages/cli/src/$1'),
            },
            {
              find: '@trapmap/client-core',
              replacement: resolve(__dirname, './packages/client-core/src/index.ts'),
            },
          ],
        },
      },
      {
        test: {
          name: 'evals',
          root: './evals',
          include: ['**/*.test.ts'],

          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: ['**/*.test.ts', '**/*.d.ts', '**/dist/**', '**/node_modules/**'],
            thresholds: {
              lines: 70,
              functions: 70,
              branches: 60,
              statements: 70,
            },
          },
        },
        resolve: {
          alias: [
            {
              find: /^@trapmap\/contracts\/evals$/,
              replacement: resolve(__dirname, './packages/contracts/src/domain/evals/index.ts'),
            },
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
            {
              find: /^@trapmap\/server\/(.+)$/,
              replacement: resolve(__dirname, './packages/server/src/$1'),
            },
          ],
        },
      },
    ],
    pool: 'forks',
    maxWorkers: rootVitestMaxWorkers,
    minWorkers: rootVitestMinWorkers,
  },
});
