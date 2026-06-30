import { describe, expect, it } from 'vitest';

describe('agent planning eval contracts', () => {
  it('defines validated case, scenario, and report schemas', async () => {
    const mod = await import('./agent-planning.js').catch(() => null);

    expect(mod).not.toBeNull();

    const caseInput = {
      schemaVersion: 1,
      taskId: 'task-upgrade-ci-pipeline',
      variantId: 'task-upgrade-ci-pipeline-skill-set-none',
      variantGroupId: 'skill-set',
      tier: 'smoke',
      taskType: 'sequential',
      taskComplexity: 'medium',
      contextSetKind: 'skill-set',
      interferenceLevel: 'none',
      interferenceSources: [],
      promptTemplateId: 'default-agent-planning',
      scenarioId: 'scenario-upgrade-ci-pipeline',
      tags: ['ci', 'planning'],
      expectedOutcome: {
        finalAnswer: 'Upgrade the CI pipeline in a deterministic order.',
        successCriteria: ['upgrade completed'],
      },
      goldenPath: {
        requiredSteps: ['inspect current pipeline', 'apply migration', 'run validation'],
        keyActions: ['inspect current pipeline', 'run validation'],
        allowedAlternativeActions: ['review changelog'],
        forbiddenActions: ['delete production database'],
        stepWeights: {
          'inspect current pipeline': 0.3,
          'apply migration': 0.4,
          'run validation': 0.3,
        },
      },
      judgeRubric: {
        dimensions: [
          {
            id: 'path-correctness',
            label: 'Path correctness',
            weight: 0.6,
            guidance: 'Follows the expected sequence.',
          },
          {
            id: 'final-answer',
            label: 'Final answer quality',
            weight: 0.4,
            guidance: 'Ends with the expected outcome.',
          },
        ],
      },
    };

    const parsedCase = mod?.agentPlanningEvalCaseSchema.parse(caseInput);
    expect(parsedCase?.variantId).toBe(caseInput.variantId);

    const scenarioInput = {
      scenarioId: 'scenario-upgrade-ci-pipeline',
      taskId: 'task-upgrade-ci-pipeline',
      variantIds: [caseInput.variantId],
      taskPrompt: 'Plan how to upgrade the CI pipeline safely.',
      promptTemplateId: 'default-agent-planning',
      actor: {
        mode: 'dry-run',
        provider: 'fallback',
      },
      context: {
        required: [
          { id: 'skill-ci-upgrade', kind: 'skill', title: 'CI Upgrade Guide', body: '...' },
        ],
        optional: [],
        interference: [],
      },
      metadata: {
        repository: 'trap-map',
      },
    };

    const parsedScenario = mod?.agentPlanningEvalScenarioSchema.parse(scenarioInput);
    expect(parsedScenario?.context.required).toHaveLength(1);

    const reportInput = {
      meta: {
        schemaVersion: 1,
        timestamp: '2026-06-30T12:00:00+00:00',
        durationMs: 120,
        runner: 'agent-planning',
        options: {
          tier: 'smoke',
          dryRun: true,
          provider: 'fallback',
          promptTemplateId: 'default-agent-planning',
        },
      },
      summary: {
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        passRate: 1,
        avgScore: 0.9,
      },
      cases: [
        {
          taskId: caseInput.taskId,
          variantId: caseInput.variantId,
          variantGroupId: caseInput.variantGroupId,
          tier: caseInput.tier,
          taskType: caseInput.taskType,
          taskComplexity: caseInput.taskComplexity,
          contextSetKind: caseInput.contextSetKind,
          interferenceLevel: caseInput.interferenceLevel,
          passed: true,
          totalScore: 0.9,
          pathScore: 1,
          finalAnswerScore: 0.8,
          actorOutput: '1. inspect current pipeline\n2. apply migration\n3. run validation',
          normalizedPlan: ['inspect current pipeline', 'apply migration', 'run validation'],
          deterministicPrecheck: {
            passed: true,
            missingRequiredSteps: [],
            missingKeyActions: [],
            forbiddenActionHits: [],
            emptyOutput: false,
            parseFailed: false,
          },
          judge: {
            totalScore: 0.9,
            pathScore: 1,
            finalAnswerScore: 0.8,
            dimensionScores: [
              {
                dimensionId: 'path-correctness',
                score: 1,
                rationale: 'All required steps were present.',
              },
            ],
            matchedKeyActions: ['inspect current pipeline', 'run validation'],
            missingKeyActions: [],
            forbiddenActionHits: [],
            summary: 'Strong plan.',
          },
          durationMs: 15,
        },
      ],
      groups: [
        {
          taskId: caseInput.taskId,
          variantCount: 2,
          skillSetAvg: 0.6,
          planGraphSetAvg: 0.9,
          absoluteDiff: 0.3,
          relativeLift: 0.5,
          interferenceComparisons: [
            {
              baselineLevel: 'none',
              candidateLevel: 'high',
              baselineAvg: 0.9,
              candidateAvg: 0.7,
              absoluteDiff: -0.2,
            },
          ],
        },
      ],
      slices: [
        {
          dimension: 'taskType',
          value: 'sequential',
          caseCount: 1,
          avgScore: 0.9,
          passRate: 1,
        },
      ],
    };

    const parsedReport = mod?.agentPlanningEvalReportSchema.parse(reportInput);
    expect(parsedReport?.groups[0]?.relativeLift).toBe(0.5);
  });

  it('rejects malformed golden path weights and pass rate drift', async () => {
    const mod = await import('./agent-planning.js').catch(() => null);

    expect(mod).not.toBeNull();

    expect(() =>
      mod?.agentPlanningEvalCaseSchema.parse({
        schemaVersion: 1,
        taskId: 'task-invalid',
        variantId: 'task-invalid-skill-set-none',
        variantGroupId: 'skill-set',
        tier: 'smoke',
        taskType: 'sequential',
        taskComplexity: 'medium',
        contextSetKind: 'skill-set',
        interferenceLevel: 'none',
        interferenceSources: [],
        promptTemplateId: 'default-agent-planning',
        scenarioId: 'scenario-invalid',
        tags: [],
        expectedOutcome: {
          finalAnswer: 'answer',
          successCriteria: ['done'],
        },
        goldenPath: {
          requiredSteps: ['a', 'b'],
          keyActions: ['a'],
          allowedAlternativeActions: [],
          forbiddenActions: [],
          stepWeights: {
            a: 0.2,
          },
        },
        judgeRubric: {
          dimensions: [
            {
              id: 'path',
              label: 'Path',
              weight: 1,
              guidance: '...',
            },
          ],
        },
      }),
    ).toThrow();

    expect(() =>
      mod?.agentPlanningEvalReportSchema.parse({
        meta: {
          schemaVersion: 1,
          timestamp: '2026-06-30T12:00:00+00:00',
          durationMs: 10,
          runner: 'agent-planning',
          options: {
            tier: 'smoke',
            dryRun: true,
            provider: 'fallback',
            promptTemplateId: 'default-agent-planning',
          },
        },
        summary: {
          totalCases: 2,
          passedCases: 1,
          failedCases: 1,
          passRate: 0.25,
          avgScore: 0.5,
        },
        cases: [],
        groups: [],
        slices: [],
      }),
    ).toThrow();
  });
});
