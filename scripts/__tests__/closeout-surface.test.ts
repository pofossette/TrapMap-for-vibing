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

describe('closeout surface guardrails', () => {
  it('defines dedicated closeout command entrypoints', () => {
    const pkg = readPackageJson();

    expect(pkg.scripts).toMatchObject({
      'test:observability-closeout': expect.any(String),
      'test:discovery-closeout': expect.any(String),
      'test:distributed-closeout': expect.any(String),
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

  it('guards the root plan closeout state wording', () => {
    const budgets = readComplexityBudgets();
    const rule = budgets.docRules.find((entry) => entry.file === 'plan.md');

    expect(rule).toBeDefined();
    expect(rule?.mustContain ?? []).toEqual(
      expect.arrayContaining([
        '状态：`收口中`',
        'Phase 4 跨阶段回归与基准',
        '状态：`收口中`',
        'Phase 5 文档与交付收口',
        '状态：`收口中`',
      ]),
    );
  });
});
