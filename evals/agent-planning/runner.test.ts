import { describe, expect, it } from 'vitest';

describe('agent planning eval scaffold', () => {
  it('loads smoke fixtures and runs deterministic dry-run reporting', async () => {
    const smokeMod = await import('./smoke.js').catch(() => null);
    const runMod = await import('./run.js').catch(() => null);

    expect(smokeMod).not.toBeNull();
    expect(runMod).not.toBeNull();

    const smokeCases = smokeMod?.smokeCases ?? [];
    expect(smokeCases.length).toBeGreaterThanOrEqual(3);

    const groupedVariants = new Map<string, Set<string>>();
    for (const case_ of smokeCases) {
      const groups = groupedVariants.get(case_.taskId) ?? new Set<string>();
      groups.add(case_.contextSetKind);
      groupedVariants.set(case_.taskId, groups);
    }

    expect([...groupedVariants.values()].every((kinds) => kinds.has('skill-set'))).toBe(true);
    expect([...groupedVariants.values()].some((kinds) => kinds.has('plan-graph-set'))).toBe(true);
    expect(smokeCases.some((case_) => case_.interferenceLevel === 'high')).toBe(true);

    const report = await runMod?.runAgentPlanningEval({
      tier: 'smoke',
      dryRun: true,
      provider: 'fallback',
    });

    expect(report?.summary.totalCases).toBe(smokeCases.length);
    expect(report?.meta.options.dryRun).toBe(true);
    expect(
      report?.cases.every(
        (caseResult: { actorOutput: string }) => caseResult.actorOutput.length > 0,
      ),
    ).toBe(true);
    expect(report?.groups.length).toBeGreaterThan(0);
    expect(
      report?.slices.some(
        (slice: { dimension: string; value: string }) =>
          slice.dimension === 'contextSetKind' && slice.value === 'plan-graph-set',
      ),
    ).toBe(true);
  });

  it('flags missing steps, forbidden actions, and unparseable output in deterministic precheck', async () => {
    const scoringMod = await import('./lib/scoring.js').catch(() => null);

    expect(scoringMod).not.toBeNull();

    const evaluation = scoringMod?.evaluateDeterministicPrecheck({
      normalizedPlan: ['inspect current pipeline', 'delete production database'],
      actorOutput: 'delete production database',
      caseDefinition: {
        goldenPath: {
          requiredSteps: ['inspect current pipeline', 'run validation'],
          keyActions: ['run validation'],
          allowedAlternativeActions: [],
          forbiddenActions: ['delete production database'],
          stepWeights: {
            'inspect current pipeline': 0.5,
            'run validation': 0.5,
          },
        },
      },
      parseFailed: true,
    });

    expect(evaluation?.passed).toBe(false);
    expect(evaluation?.missingRequiredSteps).toContain('run validation');
    expect(evaluation?.missingKeyActions).toContain('run validation');
    expect(evaluation?.forbiddenActionHits).toContain('delete production database');
    expect(evaluation?.parseFailed).toBe(true);
  });
});
