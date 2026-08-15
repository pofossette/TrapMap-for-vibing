import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootVitestMaxWorkers = process.env.VITEST_MAX_WORKERS ?? '50%';
const rootVitestMinWorkers = process.env.VITEST_MIN_WORKERS ?? '1';
const fastifyEntry = resolve(__dirname, './node_modules/fastify/fastify.js');
const alias = [
  {
    find: /^@trapmap\/contracts\/evals$/,
    replacement: resolve(__dirname, './packages/contracts/src/domain/evals/index.ts'),
  },
  {
    find: /^@trapmap\/backend-core\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/backend-core/src/$1.ts'),
  },
  {
    find: /^@trapmap\/host-distributed\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/host-distributed/src/$1.ts'),
  },
  {
    find: /^@trapmap\/host-local\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/host-local/src/$1.ts'),
  },
  {
    find: /^@trapmap\/cli\/(.+)\.js$/,
    replacement: resolve(__dirname, './apps/cli/src/$1.ts'),
  },
  {
    find: /^@trapmap\/web-panel\/(.+)\.js$/,
    replacement: resolve(__dirname, './apps/web-panel/src/$1.ts'),
  },
  {
    find: '@trapmap/contracts',
    replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
  },
  {
    find: '@trapmap/lib',
    replacement: resolve(__dirname, './packages/lib/src/index.ts'),
  },
  {
    find: '@trapmap/backend-core',
    replacement: resolve(__dirname, './packages/backend-core/src/index.ts'),
  },
  {
    find: /^@trapmap\/ai-providers\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/ai-providers/src/$1.ts'),
  },
  {
    find: '@trapmap/ai-providers',
    replacement: resolve(__dirname, './packages/ai-providers/src/index.ts'),
  },
  {
    find: /^@trapmap\/service-knowledge-read\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/service-knowledge-read/src/$1.ts'),
  },
  {
    find: /^@trapmap\/service-knowledge-write\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/service-knowledge-write/src/$1.ts'),
  },
  {
    find: /^@trapmap\/service-candidate-ingestion\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/service-candidate-ingestion/src/$1.ts'),
  },
  {
    find: /^@trapmap\/service-governance-review\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/service-governance-review/src/$1.ts'),
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
    find: '@trapmap/service-identity-access',
    replacement: resolve(__dirname, './packages/service-identity-access/src/index.ts'),
  },
  {
    find: '@trapmap/service-candidate-ingestion',
    replacement: resolve(__dirname, './packages/service-candidate-ingestion/src/index.ts'),
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
    find: '@trapmap/persistence-schema',
    replacement: resolve(__dirname, './packages/persistence-schema/src/index.ts'),
  },
  {
    find: '@trapmap/client-core',
    replacement: resolve(__dirname, './packages/client-core/src/index.ts'),
  },
  {
    find: '@trapmap/host-distributed',
    replacement: resolve(__dirname, './packages/host-distributed/src/index.ts'),
  },
  {
    find: '@trapmap/host-local',
    replacement: resolve(__dirname, './packages/host-local/src/index.ts'),
  },
  { find: 'fastify', replacement: fastifyEntry },
];
const project = (name: string, root: string, include = ['src/**/*.test.ts']) => ({
  test: { name, root, include },
  resolve: { alias },
});

export default defineConfig({
  test: {
    projects: [
      project('ai-providers', './packages/ai-providers'),
      {
        ...project('scripts', './scripts', ['__tests__/**/*.test.ts']),
        resolve: {
          alias: [
            ...alias,
            {
              find: '@trapmap/service-knowledge-write',
              replacement: resolve(__dirname, './packages/service-knowledge-write/src/index.ts'),
            },
          ],
        },
      },
      project('contracts', './packages/contracts'),
      project('lib', './packages/lib'),
      project('backend-core', './packages/backend-core'),
      project('client-core', './packages/client-core'),
      project('service-identity-access', './packages/service-identity-access'),
      project('service-candidate-ingestion', './packages/service-candidate-ingestion'),
      project('service-governance-review', './packages/service-governance-review'),
      project('service-job-runtime', './packages/service-job-runtime'),
      project('service-knowledge-read', './packages/service-knowledge-read'),
      project('service-knowledge-write', './packages/service-knowledge-write'),
      project('host-local', './packages/host-local'),
      project('host-distributed', './packages/host-distributed'),
      {
        ...project('web-panel', './apps/web-panel', ['src/**/*.test.ts', 'src/**/*.test.tsx']),
        test: {
          name: 'web-panel',
          root: './apps/web-panel',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          environment: 'jsdom',
        },
        resolve: {
          alias: [
            ...alias,
            {
              find: /^@trapmap\/web-panel\/(.+)$/,
              replacement: resolve(__dirname, './apps/web-panel/src/$1'),
            },
            {
              find: '@trapmap/web-panel',
              replacement: resolve(__dirname, './apps/web-panel/src/index.ts'),
            },
          ],
        },
      },
      project('cli', './apps/cli'),
      project('app-light', './apps/light'),
      project('app-distributed', './apps/distributed'),
      project('app-migration', './apps/migration'),
      project('evals', './evals', ['**/*.test.ts']),
    ],
    pool: 'forks',
    maxWorkers: rootVitestMaxWorkers,
    minWorkers: rootVitestMinWorkers,
  },
});
