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
    silent: process.env.CI ? 'passed-only' : false,
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
          name: 'host-local',
          root: './packages/host-local',
          include: ['src/**/*.test.ts'],
        },
        resolve: {
          alias: [
            {
              find: /^@trapmap\/server\/lib\/(.+)\.js$/,
              replacement: resolve(__dirname, './packages/server/src/lib/$1.ts'),
            },
            {
              find: '@trapmap/server',
              replacement: resolve(__dirname, './packages/server/src/index.ts'),
            },
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
          name: 'service-identity-access',
          root: './packages/service-identity-access',
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
          name: 'service-candidate-ingestion',
          root: './packages/service-candidate-ingestion',
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
          name: 'service-knowledge-read',
          root: './packages/service-knowledge-read',
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
          name: 'service-job-runtime',
          root: './packages/service-job-runtime',
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
              find: '@trapmap/service-identity-access',
              replacement: resolve(__dirname, './packages/service-identity-access/src/index.ts'),
            },
            {
              find: '@trapmap/client-core',
              replacement: resolve(__dirname, './packages/client-core/src/index.ts'),
            },
            {
              find: '@trapmap/service-candidate-ingestion',
              replacement: resolve(
                __dirname,
                './packages/service-candidate-ingestion/src/index.ts',
              ),
            },
            {
              find: '@trapmap/service-knowledge-read',
              replacement: resolve(__dirname, './packages/service-knowledge-read/src/index.ts'),
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
              find: '@trapmap/service-job-runtime',
              replacement: resolve(__dirname, './packages/service-job-runtime/src/index.ts'),
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
          name: 'web-panel',
          root: './packages/web-panel',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          environment: 'jsdom',
          globals: true,
        },
        resolve: {
          alias: [
            {
              find: '@trapmap/contracts',
              replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
            },
            {
              find: '@trapmap/client-core',
              replacement: resolve(__dirname, './packages/client-core/src/index.ts'),
            },
            {
              find: /^@trapmap\/web-panel\/(.+)$/,
              replacement: resolve(__dirname, './packages/web-panel/src/$1'),
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
