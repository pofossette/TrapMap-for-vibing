import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootVitestMaxWorkers = process.env.VITEST_MAX_WORKERS ?? '50%';
const rootVitestMinWorkers = process.env.VITEST_MIN_WORKERS ?? '1';
const fastifyEntry = resolve(
  __dirname,
  './node_modules/.pnpm/fastify@5.8.4/node_modules/fastify/fastify.js',
);

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
          name: 'service-governance-review',
          root: './packages/service-governance-review',
          include: ['src/**/*.test.ts'],
        },
        resolve: {
          alias: [
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
            {
              find: '@trapmap/backend-core',
              replacement: resolve(__dirname, './packages/backend-core/src/index.ts'),
            },
            {
              find: 'fastify',
              replacement: fastifyEntry,
            },
          ],
        },
      },
      {
        test: {
          name: 'service-knowledge-write',
          root: './packages/service-knowledge-write',
          include: ['src/**/*.test.ts'],
        },
        resolve: {
          alias: [
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
            {
              find: '@trapmap/backend-core',
              replacement: resolve(__dirname, './packages/backend-core/src/index.ts'),
            },
            {
              find: 'fastify',
              replacement: fastifyEntry,
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
          name: 'host-distributed',
          root: './packages/host-distributed',
          include: ['src/**/*.test.ts'],
        },
        resolve: {
          alias: [
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
            {
              find: '@trapmap/backend-core',
              replacement: resolve(__dirname, './packages/backend-core/src/index.ts'),
            },
            {
              find: '@trapmap/client-core',
              replacement: resolve(__dirname, './packages/client-core/src/index.ts'),
            },
            {
              find: '@trapmap/service-knowledge-write',
              replacement: resolve(__dirname, './packages/service-knowledge-write/src/index.ts'),
            },
            {
              find: '@trapmap/service-governance-review',
              replacement: resolve(__dirname, './packages/service-governance-review/src/index.ts'),
            },
            {
              find: 'fastify',
              replacement: fastifyEntry,
            },
          ],
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
