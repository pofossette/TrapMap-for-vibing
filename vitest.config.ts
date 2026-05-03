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
          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: [
              '**/*.test.ts',
              '**/*.d.ts',
              '**/dist/**',
              '**/node_modules/**',
            ],
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
            exclude: [
              '**/*.test.ts',
              '**/*.d.ts',
              '**/dist/**',
              '**/node_modules/**',
            ],
            thresholds: {
              lines: 70,
              functions: 70,
              branches: 60,
              statements: 70,
            },
          },
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
          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: [
              '**/*.test.ts',
              '**/*.d.ts',
              '**/dist/**',
              '**/node_modules/**',
            ],
            thresholds: {
              lines: 70,
              functions: 70,
              branches: 60,
              statements: 70,
            },
          },
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
          coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: [
              '**/*.test.ts',
              '**/*.d.ts',
              '**/dist/**',
              '**/node_modules/**',
            ],
            thresholds: {
              lines: 70,
              functions: 70,
              branches: 60,
              statements: 70,
            },
          },
        },
        resolve: {
          alias: {
            '@trapmap/contracts': resolve(__dirname, './packages/contracts/src/index.ts'),
          },
        },
      },
    ],
    // 使用 forks 池而非 threads 池，更稳定且内存使用更可控
    pool: 'forks',
    poolOptions: {
      forks: {
        // 限制只有一个 worker，防止多进程爆炸
        singleFork: true,
      },
    },
    // 全局并发限制：一次只运行一个测试文件
    maxConcurrency: 1,
    // 禁用并行测试
    sequence: {
      concurrent: false,
    },
  },
});
