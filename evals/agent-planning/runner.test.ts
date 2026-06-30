import { describe, expect, it } from 'vitest';

describe('agent planning eval scaffold', () => {
  it('keeps smoke/core datasets self-consistent and covers required planning behaviors', async () => {
    const smokeMod = await import('./smoke.js').catch(() => null);
    const coreMod = await import('./core.js').catch(() => null);

    expect(smokeMod).not.toBeNull();
    expect(coreMod).not.toBeNull();

    const smokeCases = smokeMod?.smokeCases ?? [];
    const smokeScenarios = smokeMod?.smokeScenarios ?? [];
    const coreCases = coreMod?.coreCases ?? [];
    const coreScenarios = coreMod?.coreScenarios ?? [];

    expect(smokeCases.length).toBeGreaterThanOrEqual(5);
    expect(coreCases.length).toBeGreaterThan(smokeCases.length);

    const smokeScenarioIds = new Set(smokeScenarios.map((scenario) => scenario.scenarioId));
    const coreScenarioIds = new Set(coreScenarios.map((scenario) => scenario.scenarioId));

    for (const caseDefinition of smokeCases) {
      expect(caseDefinition.tier).toBe('smoke');
      expect(caseDefinition.tags).toContain('smoke');
      expect(smokeScenarioIds.has(caseDefinition.scenarioId)).toBe(true);
    }

    for (const caseDefinition of coreCases) {
      expect(caseDefinition.tier).toBe('core');
      expect(caseDefinition.tags).toContain('core');
      expect(coreScenarioIds.has(caseDefinition.scenarioId)).toBe(true);
    }

    const smokeTaskIds = new Set(smokeCases.map((caseDefinition) => caseDefinition.taskId));
    const coreTaskIds = new Set(coreCases.map((caseDefinition) => caseDefinition.taskId));
    const coreOnlyTaskIds = [...coreTaskIds].filter((taskId) => !smokeTaskIds.has(taskId));
    expect(coreOnlyTaskIds.length).toBeGreaterThanOrEqual(1);

    expect(
      smokeCases.some(
        (caseDefinition) =>
          caseDefinition.contextSetKind === 'skill-set' &&
          caseDefinition.interferenceLevel === 'none' &&
          caseDefinition.taskType === 'sequential',
      ),
    ).toBe(true);
    expect(
      smokeCases.some(
        (caseDefinition) =>
          caseDefinition.contextSetKind === 'plan-graph-set' &&
          caseDefinition.interferenceLevel === 'none' &&
          caseDefinition.taskType === 'sequential',
      ),
    ).toBe(true);
    expect(
      smokeCases.some(
        (caseDefinition) =>
          caseDefinition.expectedOutcome.finalAnswer.toLowerCase().includes('insufficient') &&
          caseDefinition.tags.includes('conservative-response'),
      ),
    ).toBe(true);
    expect(
      smokeCases.some(
        (caseDefinition) =>
          caseDefinition.interferenceLevel === 'high' &&
          caseDefinition.tags.includes('high-interference'),
      ),
    ).toBe(true);
    expect(
      coreCases.some(
        (caseDefinition) =>
          caseDefinition.taskType === 'composite' &&
          caseDefinition.tags.includes('multi-step-decomposition'),
      ),
    ).toBe(true);
    expect(
      coreCases.some(
        (caseDefinition) =>
          caseDefinition.goldenPath.forbiddenActions.length > 0 &&
          caseDefinition.tags.includes('out-of-scope-guard'),
      ),
    ).toBe(true);
  });

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
    expect(report?.summary.failedCases).toBe(0);
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
