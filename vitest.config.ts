import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootVitestMaxWorkers = process.env.VITEST_MAX_WORKERS ?? '50%';
const rootVitestMinWorkers = process.env.VITEST_MIN_WORKERS ?? '1';
const fastifyEntry = resolve(__dirname, './node_modules/fastify/fastify.js');
const alias = [
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
    find: '@trapmap/lib/hash.js',
    replacement: resolve(__dirname, './packages/lib/src/hash.ts'),
  },
  {
    find: '@trapmap/lib/canonical-json.js',
    replacement: resolve(__dirname, './packages/lib/src/canonical-json.ts'),
  },
  {
    find: '@trapmap/lib/vector.js',
    replacement: resolve(__dirname, './packages/lib/src/vector.ts'),
  },
  {
    find: '@trapmap/lib',
    replacement: resolve(__dirname, './packages/lib/src/index.ts'),
  },
  {
    find: '@trapmap/skill-registry',
    replacement: resolve(__dirname, './packages/skill-registry/src/index.ts'),
  },
  {
    find: '@trapmap/infra',
    replacement: resolve(__dirname, './packages/infra/src/index.ts'),
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
    find: /^@trapmap\/service-cron\/(.+)\.js$/,
    replacement: resolve(__dirname, './packages/service-cron/src/$1.ts'),
  },
  {
    find: '@trapmap/service-cron',
    replacement: resolve(__dirname, './packages/service-cron/src/index.ts'),
  },
  {
    find: '@trapmap/db',
    replacement: resolve(__dirname, './packages/db/src/index.ts'),
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
const project = (name: string, root: string, include = ['test/**/*.test.ts']) => ({
  test: { name, root, include },
  resolve: { alias },
});

export default defineConfig({
  test: {
    projects: [
      project('ai-providers', './packages/ai-providers'),
      project('assembly', './packages/assembly'),
      {
        ...project('scripts', './scripts', ['__tests__/**/*.test.ts', 'test/**/*.test.ts']),
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
      project('db', './packages/db'),
      project('lib', './packages/lib'),
      project('infra', './packages/infra'),
      project('backend-core', './packages/backend-core'),
      project('client-core', './packages/client-core'),
      project('service-identity-access', './packages/service-identity-access'),
      project('service-candidate-ingestion', './packages/service-candidate-ingestion'),
      project('service-governance-review', './packages/service-governance-review'),
      project('service-job-runtime', './packages/service-job-runtime'),
      project('service-cron', './packages/service-cron'),
      project('service-knowledge-read', './packages/service-knowledge-read'),
      project('service-knowledge-write', './packages/service-knowledge-write'),
      project('host-local', './packages/host-local'),
      project('host-distributed', './packages/host-distributed'),
      {
        ...project('web-panel', './apps/web-panel', ['test/**/*.test.ts', 'test/**/*.test.tsx']),
        test: {
          name: 'web-panel',
          root: './apps/web-panel',
          include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
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
      project('mcp', './apps/mcp'),
      project('app-light', './apps/light'),
      project('app-distributed', './apps/distributed'),
      project('app-migration', './apps/migration'),
      project('skill-registry', './packages/skill-registry', ['test/**/*.test.ts', 'src/**/*.test.ts']),
      project('evals', './evals', ['**/*.test.ts']),
    ],
    pool: 'forks',
    maxWorkers: rootVitestMaxWorkers,
    minWorkers: rootVitestMinWorkers,
  },
});
