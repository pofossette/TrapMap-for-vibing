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

function readRepoFile(relativePath: string): string {
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
      'test:runtime-closeout:compose': 'bash scripts/run-compose-runtime-closeout.sh',
    });
  });

  it('keeps the Compose runtime closeout isolated, measured, and self-cleaning', () => {
    const script = readRepoFile('scripts/run-compose-runtime-closeout.sh');

    expect(script).toContain('TRAPMAP_CLOSEOUT_BASE_URL');
    expect(script).toContain('TRAPMAP_SYSTEM_ADMIN_KEY');
    expect(script).toContain('knowledge-write');
    expect(script).toContain('60000');
    expect(script).toContain('down --volumes --remove-orphans');
    expect(script).toContain('gateway knowledge-write governance-worker outbox-worker');
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

  it('guards the current active mainline in plan.md', () => {
    const budgets = readComplexityBudgets();
    const rule = budgets.docRules.find((entry) => entry.file === 'plan.md');

    expect(rule).toBeDefined();
    expect(rule?.mustContain ?? []).toEqual(
      expect.arrayContaining([
        'Documentation Validation and Observability Platform',
        'docs/todos/documentation-validation-and-observability-platform.md',
        'open-debt-and-compromises.md',
      ]),
    );
    expect(rule?.mustNotContain ?? []).toEqual(
      expect.arrayContaining([
        'docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md',
      ]),
    );
  });

  it('guards active-mainline wording in truth and archive indexes', () => {
    const budgets = readComplexityBudgets();
    const rules = budgets.docRules;

    const truthRule = rules.find(
      (entry) =>
        entry.file === 'docs/reference/SYSTEM_TRUTH_SOURCES.md' &&
        entry.mustContain?.includes('Documentation Validation and Observability Platform'),
    );
    const archiveRule = rules.find((entry) => entry.file === 'docs/archived/README.md');

    expect(truthRule?.mustContain ?? []).toEqual(
      expect.arrayContaining(['Documentation Validation and Observability Platform']),
    );
    expect(archiveRule?.mustContain ?? []).toEqual(
      expect.arrayContaining([
        '当前根 `plan.md` 指向“Documentation Validation and Observability Platform”',
      ]),
    );
  });

  it('freezes the compatibility deletion contract and archived observability status', () => {
    const guard = readRepoFile('scripts/__tests__/compatibility-retirement-guard.test.ts');
    const archivedObservabilityDetail = readRepoFile(
      'docs/archived/archived-plans/observability-traceability-closure.md',
    );

    expect(guard).toContain('const completedOwnerWaves');
    expect(guard).toContain('wave-10');
    expect(guard).toContain('productionCompatibilityReferences');
    expect(guard).toContain('@trapmap/server');
    expect(archivedObservabilityDetail).toContain('状态：** 已归档');
  });

  it('guards observability verification and regression docs against stale closeout facts', () => {
    const readme = readDoc('README.md');
    const testingDoc = readDoc('docs/operations/TESTING.md');
    const verificationDoc = readDoc('docs/archived/operations/OBSERVABILITY-VERIFICATION.md');
    const regressionDoc = readDoc('docs/operations/REGRESSION-COMMANDS.md');
    const deploymentDoc = readDoc('docs/architecture/DEPLOYMENT.md');

    expect(readme).toContain(
      '`@trapmap/host-local` 的 closeout 验收路径固定为 `build -> start -> observability-benchmark`',
    );
    expect(readme).toContain('@trapmap/host-local');
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

  it('prevents the old compatibility plan from being declared active in indexes', () => {
    const budgets = readComplexityBudgets();

    const planRule = budgets.docRules.find((entry) => entry.file === 'plan.md');
    const todosRule = budgets.docRules.find((entry) => entry.file === 'docs/todos/README.md');

    expect(planRule?.mustNotContain ?? []).toEqual(
      expect.arrayContaining([
        'docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md',
      ]),
    );
    // todos/README.md should not re-declare the old plan as active
    expect(todosRule?.mustNotContain ?? []).toEqual(
      expect.arrayContaining([
        'docs/todos/compatibility-shell-retirement-runtime-infra-ownership.md',
      ]),
    );
  });

  it('guards that SYSTEM_TRUTH_SOURCES does not treat deleted packages as current authority', () => {
    const truthSources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');

    // Deleted packages should be marked as deleted, not listed as current authority
    expect(truthSources).toContain('**已删除**（Wave-10）');
    expect(truthSources).toContain('packages/server` 已于 Wave-10 删除');
  });
});
