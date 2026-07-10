import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

interface PackageJson {
  scripts?: Record<string, string>;
}

interface DocRule {
  file: string;
  mustContain?: string[];
  mustNotContain?: string[];
  mustMatchRegex?: string[];
}

interface ComplexityBudgets {
  docRules: DocRule[];
}

const repoRoot = resolve(import.meta.dirname, '../..');

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf-8')) as PackageJson;
}

function readComplexityBudgets(): ComplexityBudgets {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'scripts/complexity-budgets.json'), 'utf-8'),
  ) as ComplexityBudgets;
}

function readDoc(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf-8');
}

describe('closeout surface guardrails', () => {
  it('defines dedicated closeout command entrypoints', () => {
    const pkg = readPackageJson();

    expect(pkg.scripts).toMatchObject({
      'test:observability-closeout': expect.any(String),
      'test:discovery-closeout': expect.any(String),
      'test:distributed-closeout': expect.any(String),
      'test:observability-benchmark': expect.any(String),
    });
  });

  it('guards the corrected NestJS readiness wording in observability operations docs', () => {
    const budgets = readComplexityBudgets();
    const rule = budgets.docRules.find(
      (entry) => entry.file === 'docs/operations/OBSERVABILITY-OPERATIONS.md',
    );

    expect(rule).toBeDefined();
    expect(rule?.mustContain ?? []).toEqual(
      expect.arrayContaining([
        'NestJS: `not-ready` 和 `unhealthy` 返回 `503`；`degraded` 和 `ready` 返回 `200`',
      ]),
    );
    expect(rule?.mustNotContain ?? []).toEqual(
      expect.arrayContaining(['NestJS: 当前始终返回 200']),
    );
  });

  it('guards persistence doc rules against hard-coded stale schema counts', () => {
    const budgets = readComplexityBudgets();
    const rule = budgets.docRules.find(
      (entry) => entry.file === 'docs/architecture/components/PERSISTENCE.md',
    );

    expect(rule).toBeDefined();
    expect(rule?.mustContain ?? []).toEqual(
      expect.arrayContaining([
        'docs/reference/DATABASE_SCHEMA.md',
        'PostgreSQL 是主要且权威的生产存储后端',
      ]),
    );
    expect(rule?.mustContain ?? []).not.toContain('57 张表');
    expect(rule?.mustNotContain ?? []).toEqual(expect.arrayContaining(['48 张表', '56 张表']));
  });

  it('guards the root plan active eval-platform state wording', () => {
    const budgets = readComplexityBudgets();
    const rule = budgets.docRules.find((entry) => entry.file === 'plan.md');

    expect(rule).toBeDefined();
    expect(rule?.mustContain ?? []).toEqual(
      expect.arrayContaining([
        '当前主线：engineering debt and platform maturity closeout',
        '状态：`进行中`',
        'docs/todos/open-debt-and-compromises.md',
        'docs/archived/archived-plans/agent-eval-framework-evaluation-and-plan.md',
        '只保留一个当前执行入口',
      ]),
    );
  });

  it('guards observability verification and regression docs against stale closeout facts', () => {
    const readme = readDoc('README.md');
    const testingDoc = readDoc('docs/operations/TESTING.md');
    const verificationDoc = readDoc('docs/operations/OBSERVABILITY-VERIFICATION.md');
    const regressionDoc = readDoc('docs/operations/REGRESSION-COMMANDS.md');
    const deploymentDoc = readDoc('docs/architecture/DEPLOYMENT.md');

    expect(readme).toContain(
      '`@trapmap/host-local` 的 closeout 验收路径固定为 `build -> start -> observability-benchmark`',
    );
    expect(readme).toContain('本轮 closeout 不包含 `@trapmap/server build` 的全量清障');
    expect(testingDoc).toContain(
      '`@trapmap/host-local` closeout 主链路固定为 `build -> start -> observability-benchmark`',
    );
    expect(testingDoc).toContain('`dev` 仅用于开发便利，不作为 closeout 完成判据');
    expect(verificationDoc).toContain('http://127.0.0.1:4000/metrics');
    expect(verificationDoc).toContain(
      '先执行 `rtk pnpm --filter @trapmap/host-local build`，再执行 `rtk pnpm --filter @trapmap/host-local start`',
    );
    expect(verificationDoc).toContain('`build -> start -> observability-benchmark`');
    expect(verificationDoc).toContain('LOKI_HOST');
    expect(verificationDoc).toContain('CONSUL_ENABLED=true');
    expect(verificationDoc).toContain('CONSUL_HOST');
    expect(verificationDoc).toContain('CONSUL_PORT');
    expect(verificationDoc).not.toContain('http://localhost:3000/metrics');
    expect(verificationDoc).not.toContain('TRAPMAP_LOKI_URL');

    expect(regressionDoc).toContain('grep -i traceparent');
    expect(regressionDoc).not.toContain('grep X-Trace-Id');

    expect(deploymentDoc).not.toContain('当前未内置 `/metrics` 端点');
  });
});
