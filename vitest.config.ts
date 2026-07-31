import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootVitestMaxWorkers = process.env.VITEST_MAX_WORKERS ?? '50%';
const rootVitestMinWorkers = process.env.VITEST_MIN_WORKERS ?? '1';
const fastifyEntry = resolve(
  __dirname,
  './node_modules/.pnpm/fastify@5.8.4/node_modules/fastify/fastify.js',
);
const alias = [
  {
    find: '@trapmap/contracts',
    replacement: resolve(__dirname, './packages/contracts/src/index.ts'),
  },
  {
    find: '@trapmap/backend-core',
    replacement: resolve(__dirname, './packages/backend-core/src/index.ts'),
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
      project('web-panel', './packages/web-panel', ['src/**/*.test.ts', 'src/**/*.test.tsx']),
      project('cli', './packages/cli'),
      project('evals', './evals', ['**/*.test.ts']),
    ],
    pool: 'forks',
    maxWorkers: rootVitestMaxWorkers,
    minWorkers: rootVitestMinWorkers,
  },
});
