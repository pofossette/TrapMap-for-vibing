import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

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
  },
});
