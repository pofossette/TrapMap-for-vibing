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

    expect(smokeCases.length).toBeGreaterThanOrEqual(25);
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
    expect(coreOnlyTaskIds.length).toBeGreaterThanOrEqual(5);

    // Selection/ranking coverage in smoke
    expect(
      smokeCases.some(
        (caseDefinition) =>
          caseDefinition.taskType === 'selection' &&
          caseDefinition.tags.includes('selection-ranking'),
      ),
    ).toBe(true);
    // Composite/coordination coverage in smoke
    expect(
      smokeCases.some(
        (caseDefinition) =>
          caseDefinition.taskType === 'composite' &&
          caseDefinition.tags.includes('composite-coordination'),
      ),
    ).toBe(true);
    // Debugging coverage in smoke
    expect(smokeCases.some((caseDefinition) => caseDefinition.taskType === 'debugging')).toBe(true);

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
    // Conservative response coverage in core
    expect(
      coreCases.some((caseDefinition) => caseDefinition.tags.includes('conservative-response')),
    ).toBe(true);
    // Security/forbidden behavior in core
    expect(
      coreCases.some(
        (caseDefinition) =>
          caseDefinition.tags.includes('security') &&
          caseDefinition.tags.includes('forbidden-behavior'),
      ),
    ).toBe(true);
    // New domain coverage in core (caching or api-versioning)
    expect(
      coreCases.some(
        (caseDefinition) =>
          caseDefinition.tags.includes('caching') || caseDefinition.tags.includes('api-versioning'),
      ),
    ).toBe(true);

    // Interference level distribution targets
    const allCases = [...smokeCases, ...coreCases];
    const lowCount = allCases.filter((c) => c.interferenceLevel === 'low').length;
    const medCount = allCases.filter((c) => c.interferenceLevel === 'medium').length;
    const highCount = allCases.filter((c) => c.interferenceLevel === 'high').length;
    expect(lowCount).toBeGreaterThanOrEqual(7);
    expect(medCount).toBeGreaterThanOrEqual(14);
    expect(highCount).toBeGreaterThanOrEqual(21);

    // Complexity coverage
    expect(
      smokeCases.some((c) => c.taskComplexity === 'simple' && c.tags.includes('simple-task')),
    ).toBe(true);
    expect(
      coreCases.some((c) => c.taskComplexity === 'complex' && c.tags.includes('complex-task')),
    ).toBe(true);

    // New taskIds exist in smoke
    const newSmokeTaskIds = new Set(smokeCases.map((c) => c.taskId));
    expect(newSmokeTaskIds.has('task-setup-code-quality-pipeline')).toBe(true);
    expect(newSmokeTaskIds.has('task-migrate-auth-microservice')).toBe(true);
    expect(newSmokeTaskIds.has('task-replatform-legacy-monolith')).toBe(true);

    // Interference array completeness — non-empty scenarios must have exactly 21 items
    for (const scenario of smokeScenarios) {
      if (scenario.context.interference.length > 0) {
        expect(scenario.context.interference.length).toBe(21);
      }
    }
    for (const scenario of coreScenarios) {
      if (scenario.context.interference.length > 0) {
        expect(scenario.context.interference.length).toBe(21);
      }
    }
  });

  it('loads smoke fixtures and runs deterministic dry-run reporting', async () => {
    const smokeMod = await import('./smoke.js').catch(() => null);
    const runMod = await import('./run.js').catch(() => null);

    expect(smokeMod).not.toBeNull();
    expect(runMod).not.toBeNull();

    const smokeCases = smokeMod?.smokeCases ?? [];
    expect(smokeCases.length).toBeGreaterThanOrEqual(10);

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

    // Total includes skill identification cases
    const totalSmokeCases = smokeCases.length;
    expect(report?.summary.totalCases).toBeGreaterThanOrEqual(totalSmokeCases);
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

  it('includes skill-identification smoke cases with correct schema', async () => {
    const sidSmokeMod = await import('./datasets/smoke/skill-identification-smoke.js').catch(
      () => null,
    );
    const sidScenariosMod = await import(
      './scenarios/smoke/skill-identification-smoke-scenarios.js'
    ).catch(() => null);

    expect(sidSmokeMod).not.toBeNull();
    expect(sidScenariosMod).not.toBeNull();

    const sidCases = sidSmokeMod?.skillIdentificationSmokeCases ?? [];
    const sidScenarios = sidScenariosMod?.skillIdentificationSmokeScenarios ?? [];

    // 2 task groups x 2 variants = 4 smoke cases
    expect(sidCases.length).toBeGreaterThanOrEqual(4);

    // Each case has skill-identification tag
    expect(sidCases.every((c) => c.tags.includes('skill-identification'))).toBe(true);

    // Each case has matchStrategy
    expect(sidCases.every((c) => c.matchStrategy !== undefined)).toBe(true);

    // Each case has expectedSkillIds
    expect(sidCases.every((c) => (c.expectedSkillIds?.length ?? 0) > 0)).toBe(true);

    // Paired variants exist for each taskId
    const taskIds = new Set(sidCases.map((c) => c.taskId));
    for (const taskId of taskIds) {
      const variants = sidCases.filter((c) => c.taskId === taskId);
      expect(variants.some((c) => c.contextSetKind === 'skill-summary-set')).toBe(true);
      expect(variants.some((c) => c.contextSetKind === 'capsule-match-set')).toBe(true);
    }

    // Scenarios exist and link to cases
    expect(sidScenarios.length).toBeGreaterThanOrEqual(2);
    for (const scenario of sidScenarios) {
      for (const variantId of scenario.variantIds) {
        expect(sidCases.some((c) => c.variantId === variantId)).toBe(true);
      }
    }

    // Context entries include capsule-card and skill-profile kinds
    for (const scenario of sidScenarios) {
      const requiredKinds = scenario.context.required.map((e) => e.kind);
      expect(requiredKinds).toContain('skill-profile');
      expect(requiredKinds).toContain('capsule-card');
    }
  });

  it('runs skill-identification smoke dry-run with correct report structure', async () => {
    const runMod = await import('./run.js').catch(() => null);
    expect(runMod).not.toBeNull();

    const report = await runMod?.runAgentPlanningEval({
      tier: 'smoke',
      dryRun: true,
      provider: 'fallback',
    });

    expect(report).not.toBeNull();

    // Verify skill-identification cases are present (by contextSetKind)
    const sidCases = report!.cases.filter(
      (c) => c.contextSetKind === 'capsule-match-set' || c.contextSetKind === 'skill-summary-set',
    );
    expect(sidCases.length).toBeGreaterThanOrEqual(4);

    // Verify all SID cases passed in dry-run
    expect(sidCases.every((c) => c.passed)).toBe(true);

    // Verify capsule-match-set and skill-summary-set appear in slices
    const contextSlices = report!.slices.filter((s) => s.dimension === 'contextSetKind');
    const contextValues = contextSlices.map((s) => s.value);
    expect(contextValues).toContain('capsule-match-set');
    expect(contextValues).toContain('skill-summary-set');

    // Verify matchStrategy slices exist
    const strategySlices = report!.slices.filter((s) => s.dimension === 'matchStrategy');
    expect(strategySlices.length).toBeGreaterThanOrEqual(2);

    // Verify groups have capsule/skill-summary averages
    const sidGroups = report!.groups.filter((g) => sidCases.some((c) => c.taskId === g.taskId));
    for (const group of sidGroups) {
      expect(group.capsuleMatchAvg).toBeDefined();
      expect(group.skillSummaryAvg).toBeDefined();
    }
  });

  it('validates new context entry kinds pass schema', async () => {
    const contractsMod = await import('../types/index.js').catch(() => null);
    expect(contractsMod).not.toBeNull();

    const { agentPlanningContextEntrySchema } = contractsMod!;

    // capsule-card kind
    const capsuleCard = agentPlanningContextEntrySchema.safeParse({
      id: 'test-capsule',
      kind: 'capsule-card',
      title: 'Test capsule',
      body: 'Test body',
    });
    expect(capsuleCard.success).toBe(true);

    // skill-profile kind
    const skillProfile = agentPlanningContextEntrySchema.safeParse({
      id: 'test-profile',
      kind: 'skill-profile',
      title: 'Test profile',
      body: 'Test body',
    });
    expect(skillProfile.success).toBe(true);
  });

  it('validates new contextSetKind values pass schema', async () => {
    const contractsMod = await import('../types/index.js').catch(() => null);
    expect(contractsMod).not.toBeNull();

    const { agentPlanningContextSetKindSchema } = contractsMod!;

    expect(agentPlanningContextSetKindSchema.safeParse('skill-summary-set').success).toBe(true);
    expect(agentPlanningContextSetKindSchema.safeParse('capsule-match-set').success).toBe(true);
    expect(agentPlanningContextSetKindSchema.safeParse('invalid-kind').success).toBe(false);
  });

  it('validates matchStrategy refinement on eval case schema', async () => {
    const contractsMod = await import('../types/index.js').catch(() => null);
    expect(contractsMod).not.toBeNull();

    const { agentPlanningEvalCaseSchema } = contractsMod!;

    // capsule-match-set without matchStrategy should fail
    const missingStrategy = agentPlanningEvalCaseSchema.safeParse({
      schemaVersion: 1,
      taskId: 'test',
      variantId: 'test-v',
      variantGroupId: 'test-g',
      tier: 'smoke',
      taskType: 'selection',
      taskComplexity: 'simple',
      contextSetKind: 'capsule-match-set',
      interferenceLevel: 'none',
      interferenceSources: [],
      promptTemplateId: 'default-agent-planning',
      scenarioId: 'test-scenario',
      goldenPath: {
        requiredSteps: ['step1'],
        keyActions: ['step1'],
        allowedAlternativeActions: [],
        forbiddenActions: [],
        stepWeights: { step1: 1.0 },
      },
      judgeRubric: {
        dimensions: [{ id: 'd1', label: 'D1', weight: 1.0, guidance: 'test' }],
      },
      expectedOutcome: { finalAnswer: 'answer', successCriteria: ['criteria'] },
    });
    expect(missingStrategy.success).toBe(false);

    // With matchStrategy but empty expectedSkillIds should fail
    const emptySkills = agentPlanningEvalCaseSchema.safeParse({
      schemaVersion: 1,
      taskId: 'test',
      variantId: 'test-v',
      variantGroupId: 'test-g',
      tier: 'smoke',
      taskType: 'selection',
      taskComplexity: 'simple',
      contextSetKind: 'capsule-match-set',
      interferenceLevel: 'none',
      interferenceSources: [],
      promptTemplateId: 'default-agent-planning',
      scenarioId: 'test-scenario',
      goldenPath: {
        requiredSteps: ['step1'],
        keyActions: ['step1'],
        allowedAlternativeActions: [],
        forbiddenActions: [],
        stepWeights: { step1: 1.0 },
      },
      judgeRubric: {
        dimensions: [{ id: 'd1', label: 'D1', weight: 1.0, guidance: 'test' }],
      },
      expectedOutcome: { finalAnswer: 'answer', successCriteria: ['criteria'] },
      matchStrategy: 'keyword-capsule',
      expectedSkillIds: [],
    });
    expect(emptySkills.success).toBe(false);

    // Valid case should pass
    const valid = agentPlanningEvalCaseSchema.safeParse({
      schemaVersion: 1,
      taskId: 'test',
      variantId: 'test-v',
      variantGroupId: 'test-g',
      tier: 'smoke',
      taskType: 'selection',
      taskComplexity: 'simple',
      contextSetKind: 'capsule-match-set',
      interferenceLevel: 'none',
      interferenceSources: [],
      promptTemplateId: 'default-agent-planning',
      scenarioId: 'test-scenario',
      goldenPath: {
        requiredSteps: ['step1'],
        keyActions: ['step1'],
        allowedAlternativeActions: [],
        forbiddenActions: [],
        stepWeights: { step1: 1.0 },
      },
      judgeRubric: {
        dimensions: [{ id: 'd1', label: 'D1', weight: 1.0, guidance: 'test' }],
      },
      expectedOutcome: { finalAnswer: 'answer', successCriteria: ['criteria'] },
      matchStrategy: 'keyword-capsule',
      expectedSkillIds: ['skill-a'],
    });
    expect(valid.success).toBe(true);
  });
});
