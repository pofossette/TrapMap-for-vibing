import { describe, expect, it, vi } from 'vitest';

import { runUnifiedEvaluation } from '../eval-all.js';

describe('runUnifiedEvaluation', () => {
  const baseOptions = {
    tier: 'smoke' as const,
    json: false,
    verbose: false,
    dryRun: true,
    allowEmpty: false,
  };

  it('keeps behavior unchanged when no platform adapter is enabled', async () => {
    const createAdapter = vi.fn(() => ({
      kind: 'noop',
      publish: vi.fn(),
      close: vi.fn(),
    }));

    const result = await runUnifiedEvaluation(baseOptions, {
      createPlatformAdapter: createAdapter,
      publishPlatformEvent: vi.fn(),
      closePlatformAdapter: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      runRetrievalEval: vi.fn(async () => null),
      runSummaryEval: vi.fn(async () => null),
      runGraphExtractionEval: vi.fn(async () => null),
      runIngestionEval: vi.fn(async () => null),
      runAgentPlanningEval: vi.fn(async () => null),
      runLabelAlignmentEval: vi.fn(async () => null),
    });

    expect(result.exitCode).toBe(0);
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it('keeps aggregate exit semantics unchanged when platform mirroring and close emit warnings', async () => {
    const publishPlatformEvent = vi.fn();
    const closePlatformAdapter = vi.fn().mockRejectedValue(new Error('close failed'));
    const warn = vi.fn();

    const result = await runUnifiedEvaluation(
      {
        ...baseOptions,
        platform: 'json-archive' as const,
        platformOutputDir: './reports/platform-events',
      },
      {
        createPlatformAdapter: vi.fn(() => ({
          kind: 'json-archive',
          publish: vi.fn(),
          close: vi.fn(),
        })),
        publishPlatformEvent,
        closePlatformAdapter,
        warn,
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => ({
          passed: false,
          report: {
            meta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:00.000Z',
              durationMs: 1,
              options: {
                tier: 'smoke',
                dryRun: true,
                allowEmpty: false,
                verbose: 0,
              },
            },
            summary: {
              totalCases: 1,
              passedCases: 0,
              failedCases: 1,
              passRate: 0,
              passed: false,
            },
            slices: [],
            cases: [],
            failures: [],
            warnings: [],
          },
          durationMs: 1,
          summary: {
            totalCases: 1,
            passedCases: 0,
            failedCases: 1,
            passRate: 0,
            slices: [],
          },
        })),
        runSummaryEval: vi.fn(async () => null),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => null),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(publishPlatformEvent).toHaveBeenCalledTimes(2);
    expect(publishPlatformEvent.mock.calls.map(([_, __, event]) => event.family)).toEqual([
      'EvalRunStarted',
      'EvalRunFinished',
    ]);
    expect(closePlatformAdapter).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('json-archive'),
      expect.objectContaining({ message: 'close failed' }),
    );
  });

  it('publishes suite-backed run start and finish events when a platform adapter is enabled', async () => {
    const publishPlatformEvent = vi.fn();
    const closePlatformAdapter = vi.fn();

    await runUnifiedEvaluation(
      {
        ...baseOptions,
        platform: 'json-archive' as const,
        platformOutputDir: './reports/platform-events',
      },
      {
        createPlatformAdapter: vi.fn(() => ({
          kind: 'json-archive',
          publish: vi.fn(),
          close: vi.fn(),
        })),
        publishPlatformEvent,
        closePlatformAdapter,
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => ({
          passed: true,
          report: {
            meta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:05.000Z',
              durationMs: 5000,
              options: {
                tier: 'smoke',
                endpoint: '/v1/retrieval/search',
                dryRun: false,
                allowEmpty: false,
                verbose: 0,
              },
            },
            summary: {
              totalCases: 1,
              passedCases: 1,
              failedCases: 0,
              passRate: 1,
              passed: true,
            },
            slices: [],
            cohorts: [],
            modeComparisons: [],
            routingDistribution: [],
            cases: [
              {
                caseId: 'retrieval-case-1',
                endpoint: '/v1/retrieval/search',
                tier: 'smoke',
                scenarioId: 'scenario-1',
                passed: true,
                outcomeMatch: true,
                governancePassed: true,
                durationMs: 123,
                hitAt1: 1,
                hitAt5: 1,
                hitAt10: 1,
                mrr: 1,
                ndcg: 1,
                recallAt10: 1,
                fallbackApplied: false,
              },
            ],
            failures: [],
            warnings: [],
          },
          durationMs: 5000,
          summary: {
            totalCases: 1,
            passedCases: 1,
            failedCases: 0,
            passRate: 1,
            slices: [],
          },
        })),
        runSummaryEval: vi.fn(async () => ({
          passed: true,
          report: {
            meta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:08.000Z',
              durationMs: 3000,
              llmProvider: 'fallback',
              options: {
                tier: 'smoke',
                endpoint: '/v1/summary',
                dryRun: false,
                allowEmpty: false,
                verbose: 0,
              },
            },
            summary: {
              totalCases: 1,
              passedCases: 1,
              failedCases: 0,
              passRate: 1,
              passed: true,
              avgGroundedness: 1,
              avgCoverage: 1,
              forbiddenClaimHits: 0,
            },
            cases: [
              {
                caseId: 'summary-case-1',
                endpoint: '/v1/summary',
                tier: 'smoke',
                passed: true,
                groundednessScore: 1,
                coverageScore: 1,
                claimsTotal: 2,
                claimsSupported: 2,
                requiredFactsCovered: ['fact-1'],
                requiredFactsMissing: [],
                forbiddenClaimsFound: [],
                durationMs: 222,
              },
            ],
            failures: [],
          },
          durationMs: 3000,
          summary: {
            totalCases: 1,
            passedCases: 1,
            failedCases: 0,
            passRate: 1,
            avgGroundedness: 1,
            avgCoverage: 1,
            forbiddenClaimHits: 0,
          },
        })),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => ({
          passed: true,
          report: {
            meta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:10.000Z',
              durationMs: 2000,
              runner: 'agent-planning',
              options: {
                tier: 'smoke',
                dryRun: false,
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
                taskId: 'task-1',
                variantId: 'variant-1',
                variantGroupId: 'group-1',
                tier: 'smoke',
                taskType: 'debugging',
                taskComplexity: 'medium',
                contextSetKind: 'skill-set',
                interferenceLevel: 'low',
                passed: true,
                totalScore: 0.9,
                pathScore: 0.9,
                finalAnswerScore: 0.9,
                actorOutput: 'step 1',
                normalizedPlan: ['step 1'],
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
                  pathScore: 0.9,
                  finalAnswerScore: 0.9,
                  dimensionScores: [],
                  matchedKeyActions: [],
                  missingKeyActions: [],
                  forbiddenActionHits: [],
                  summary: 'ok',
                },
                durationMs: 333,
              },
            ],
            groups: [],
            slices: [],
          },
          durationMs: 2000,
          summary: {
            totalCases: 1,
            passedCases: 1,
            failedCases: 0,
            passRate: 1,
            avgScore: 0.9,
          },
        })),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    expect(publishPlatformEvent).toHaveBeenCalledTimes(6);
    expect(
      publishPlatformEvent.mock.calls.map(([_, __, event]) => `${event.suite}:${event.family}`),
    ).toEqual([
      'retrieval:EvalRunStarted',
      'retrieval:EvalRunFinished',
      'summary:EvalRunStarted',
      'summary:EvalRunFinished',
      'agent-planning:EvalRunStarted',
      'agent-planning:EvalRunFinished',
    ]);

    expect(closePlatformAdapter).toHaveBeenCalledTimes(1);
  });

  it('mirrors retrieval case, score, and assertion events without enabling retrieval trace events', async () => {
    const publishPlatformEvent = vi.fn();

    await runUnifiedEvaluation(
      {
        ...baseOptions,
        platform: 'json-archive' as const,
        platformOutputDir: './reports/platform-events',
      },
      {
        createPlatformAdapter: vi.fn(() => ({
          kind: 'json-archive',
          publish: vi.fn(),
          close: vi.fn(),
        })),
        publishPlatformEvent,
        closePlatformAdapter: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => ({
          passed: false,
          report: {
            meta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:05.000Z',
              durationMs: 5000,
              options: {
                tier: 'smoke',
                dryRun: false,
                allowEmpty: false,
                verbose: 0,
              },
            },
            summary: {
              totalCases: 2,
              passedCases: 1,
              failedCases: 1,
              passRate: 0.5,
              passed: false,
            },
            slices: [],
            cohorts: [],
            modeComparisons: [],
            routingDistribution: [],
            cases: [
              {
                caseId: 'v2-capsule-positive-smoke',
                endpoint: '/v2/retrieval/search',
                tier: 'smoke',
                passed: true,
                outcomeMatch: true,
                governancePassed: true,
                durationMs: 120,
                hitAt1: 1,
                hitAt5: 1,
                hitAt10: 1,
                mrr: 1,
                ndcg: 1,
                recallAt10: 1,
                selectedMode: 'hybrid',
                routingReason: 'v2-default-capsule',
                fallbackApplied: false,
              },
              {
                caseId: 'v3-graph-plan-selected-smoke',
                endpoint: '/v3/retrieval/search',
                tier: 'smoke',
                passed: false,
                outcomeMatch: true,
                governancePassed: true,
                durationMs: 180,
                hitAt1: 0,
                hitAt5: 1,
                hitAt10: 1,
                mrr: 0.5,
                ndcg: 0.7,
                recallAt10: 1,
                selectedMode: 'hybrid',
                routingReason: 'graph-plan-selected',
                fallbackApplied: false,
              },
            ],
            failures: [
              {
                caseId: 'v3-graph-plan-selected-smoke',
                kind: 'graph-plan-mismatch',
                description: 'Expected edge trap->skill not found',
                ids: ['trap->skill'],
                endpoint: '/v3/retrieval/search',
                tier: 'smoke',
              },
            ],
            warnings: [],
          },
          durationMs: 5000,
          summary: {
            totalCases: 2,
            passedCases: 1,
            failedCases: 1,
            passRate: 0.5,
            slices: [],
          },
        })),
        runSummaryEval: vi.fn(async () => null),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => null),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    const publishedEvents = publishPlatformEvent.mock.calls.map(([_, __, event]) => event);
    const retrievalEvents = publishedEvents.filter((event) => event.suite === 'retrieval');

    expect(retrievalEvents.map((event) => event.family)).toEqual([
      'EvalRunStarted',
      'EvalCaseStarted',
      'EvalCaseFinished',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalCaseStarted',
      'EvalCaseFinished',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalRunFinished',
    ]);

    expect(
      retrievalEvents.filter((event) => event.family === 'EvalTraceStepRecorded'),
    ).toHaveLength(0);

    expect(
      retrievalEvents
        .filter((event) => event.family === 'EvalCaseStarted')
        .map((event) => event.payload.case.caseId),
    ).toEqual(['v2-capsule-positive-smoke', 'v3-graph-plan-selected-smoke']);

    expect(
      retrievalEvents
        .filter(
          (event) =>
            event.family === 'EvalScoreRecorded' && event.caseId === 'v2-capsule-positive-smoke',
        )
        .map((event) => event.payload.scoreId),
    ).toEqual(['hitAt1', 'hitAt5', 'hitAt10', 'mrr', 'ndcg', 'recallAt10']);

    expect(
      retrievalEvents
        .filter(
          (event) =>
            event.family === 'EvalAssertionRecorded' &&
            event.caseId === 'v2-capsule-positive-smoke',
        )
        .map((event) => [event.payload.assertionId, event.payload.passed, event.payload.source]),
    ).toEqual([
      ['outcome', true, 'case.outcomeMatch'],
      ['governance', true, 'case.governancePassed'],
      ['shape', true, 'case.passed'],
    ]);

    expect(
      retrievalEvents
        .filter(
          (event) =>
            event.family === 'EvalAssertionRecorded' &&
            event.caseId === 'v3-graph-plan-selected-smoke',
        )
        .map((event) => [event.payload.assertionId, event.payload.passed, event.payload.source]),
    ).toEqual([
      ['outcome', true, 'case.outcomeMatch'],
      ['governance', true, 'case.governancePassed'],
      ['graph-plan', false, 'case.passed'],
    ]);
  });

  it('mirrors summary case, score, and assertion events without enabling summary trace events', async () => {
    const publishPlatformEvent = vi.fn();

    await runUnifiedEvaluation(
      {
        ...baseOptions,
        platform: 'json-archive' as const,
        platformOutputDir: './reports/platform-events',
      },
      {
        createPlatformAdapter: vi.fn(() => ({
          kind: 'json-archive',
          publish: vi.fn(),
          close: vi.fn(),
        })),
        publishPlatformEvent,
        closePlatformAdapter: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => null),
        runSummaryEval: vi.fn(async () => ({
          passed: false,
          report: {
            meta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:08.000Z',
              durationMs: 3000,
              llmProvider: 'fallback',
              options: {
                tier: 'smoke',
                endpoint: '/v2/retrieval/search',
                dryRun: false,
                allowEmpty: false,
                verbose: 0,
              },
            },
            summary: {
              totalCases: 2,
              passedCases: 1,
              failedCases: 1,
              passRate: 0.5,
              passed: false,
              avgGroundedness: 0.6,
              avgCoverage: 1,
              forbiddenClaimHits: 1,
            },
            cases: [
              {
                caseId: 'summary-grounded-smoke',
                endpoint: '/v2/retrieval/search',
                tier: 'smoke',
                passed: true,
                groundednessScore: 0.95,
                coverageScore: 1,
                claimsTotal: 2,
                claimsSupported: 2,
                requiredFactsCovered: ['docker-compose', 'multi-container'],
                requiredFactsMissing: [],
                forbiddenClaimsFound: [],
                durationMs: 111,
              },
              {
                caseId: 'summary-hallucination-smoke',
                endpoint: '/v2/retrieval/search',
                tier: 'smoke',
                passed: false,
                groundednessScore: 0.25,
                coverageScore: 1,
                claimsTotal: 1,
                claimsSupported: 0,
                requiredFactsCovered: [],
                requiredFactsMissing: [],
                forbiddenClaimsFound: ['Einstein'],
                durationMs: 222,
              },
            ],
            failures: [
              {
                caseId: 'summary-hallucination-smoke',
                kind: 'groundedness-below-threshold',
                description: 'Groundedness score 0.25 below minimum 0.50',
              },
              {
                caseId: 'summary-hallucination-smoke',
                kind: 'forbidden-claim-found',
                description: 'Forbidden claim found: "Einstein"',
              },
            ],
          },
          durationMs: 3000,
          summary: {
            totalCases: 2,
            passedCases: 1,
            failedCases: 1,
            passRate: 0.5,
            avgGroundedness: 0.6,
            avgCoverage: 1,
            forbiddenClaimHits: 1,
          },
        })),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => null),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    const publishedEvents = publishPlatformEvent.mock.calls.map(([_, __, event]) => event);
    const summaryEvents = publishedEvents.filter((event) => event.suite === 'summary');

    expect(summaryEvents.map((event) => event.family)).toEqual([
      'EvalRunStarted',
      'EvalCaseStarted',
      'EvalCaseFinished',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalCaseStarted',
      'EvalCaseFinished',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalRunFinished',
    ]);

    expect(summaryEvents.filter((event) => event.family === 'EvalTraceStepRecorded')).toHaveLength(
      0,
    );

    expect(
      summaryEvents
        .filter((event) => event.family === 'EvalCaseStarted')
        .map((event) => event.payload.case.caseId),
    ).toEqual(['summary-grounded-smoke', 'summary-hallucination-smoke']);

    expect(
      summaryEvents
        .filter(
          (event) =>
            event.family === 'EvalScoreRecorded' && event.caseId === 'summary-grounded-smoke',
        )
        .map((event) => [event.payload.scoreId, event.payload.score, event.payload.source]),
    ).toEqual([
      ['groundednessScore', 0.95, 'case.groundednessScore'],
      ['coverageScore', 1, 'case.coverageScore'],
    ]);

    expect(
      summaryEvents
        .filter(
          (event) =>
            event.family === 'EvalAssertionRecorded' && event.caseId === 'summary-grounded-smoke',
        )
        .map((event) => [
          event.payload.assertionId,
          event.payload.passed,
          event.payload.source,
          event.payload.expected ?? null,
          event.payload.actual ?? null,
        ]),
    ).toEqual([
      ['summary-present', true, 'case.claimsTotal', true, true],
      ['groundedness', true, 'case.groundednessScore', 0.8, 0.95],
      ['coverage', true, 'case.coverageScore', 0.7, 1],
      ['forbidden-claims', true, 'case.forbiddenClaimsFound', [], []],
    ]);

    expect(
      summaryEvents
        .filter(
          (event) =>
            event.family === 'EvalAssertionRecorded' &&
            event.caseId === 'summary-hallucination-smoke',
        )
        .map((event) => [
          event.payload.assertionId,
          event.payload.passed,
          event.payload.source,
          event.payload.expected ?? null,
          event.payload.actual ?? null,
          event.payload.reason ?? null,
        ]),
    ).toEqual([
      ['summary-present', true, 'case.claimsTotal', true, true, null],
      [
        'groundedness',
        false,
        'case.groundednessScore',
        0.5,
        0.25,
        'Groundedness score 0.25 below minimum 0.50',
      ],
      ['coverage', true, 'case.coverageScore', 0, 1, null],
      [
        'forbidden-claims',
        false,
        'case.forbiddenClaimsFound',
        [],
        ['Einstein'],
        'Forbidden claim found: "Einstein"',
      ],
    ]);
  });
});
