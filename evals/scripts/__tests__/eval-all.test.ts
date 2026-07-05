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

  it('warns and skips langfuse mirroring when required config is missing', async () => {
    const createPlatformAdapter = vi.fn();
    const publishPlatformEvent = vi.fn();
    const warn = vi.fn();

    const result = await runUnifiedEvaluation(
      {
        ...baseOptions,
        platform: 'langfuse' as const,
      },
      {
        createPlatformAdapter,
        resolveLangfuseConfigFromEnv: vi.fn(() => ({
          ok: false as const,
          warning: 'Missing LANGFUSE_SECRET_KEY',
        })),
        publishPlatformEvent,
        closePlatformAdapter: vi.fn(),
        warn,
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => null),
        runSummaryEval: vi.fn(async () => null),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => null),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(createPlatformAdapter).not.toHaveBeenCalled();
    expect(publishPlatformEvent).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Missing LANGFUSE_SECRET_KEY'));
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

  it('delegates summary platform event construction to the summary suite builder', async () => {
    const publishPlatformEvent = vi.fn();
    const buildSummaryPlatformEvents = vi.fn(async () => [
      {
        family: 'EvalRunStarted' as const,
        suite: 'summary' as const,
        tier: 'smoke' as const,
        runId: 'delegated-suite-run',
        caseId: null,
        scenarioId: null,
        timestamp: '2026-07-03T00:00:05.000Z',
        tags: ['dry-run'],
        payload: {
          reportMeta: {
            schemaVersion: 1 as const,
            timestamp: '2026-07-03T00:00:08.000Z',
            llmProvider: 'fallback' as const,
            options: {
              tier: 'smoke' as const,
              endpoint: '/v2/retrieval/search' as const,
              dryRun: true,
              allowEmpty: false,
              verbose: 0,
            },
          },
          runScope: {
            tier: 'smoke' as const,
            dryRun: true,
            allowEmpty: false,
            endpoint: '/v2/retrieval/search' as const,
            verbose: false,
            provider: 'fallback' as const,
            caseCount: 1,
            scenarioIds: ['scenario-1'],
          },
        },
      },
    ]);
    const summaryReport = {
      meta: {
        schemaVersion: 1 as const,
        timestamp: '2026-07-03T00:00:08.000Z',
        durationMs: 3000,
        llmProvider: 'fallback' as const,
        options: {
          tier: 'smoke' as const,
          endpoint: '/v2/retrieval/search' as const,
          dryRun: true,
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
          endpoint: '/v2/retrieval/search' as const,
          tier: 'smoke' as const,
          passed: true,
          groundednessScore: 1,
          coverageScore: 1,
          claimsTotal: 1,
          claimsSupported: 1,
          requiredFactsCovered: ['fact-1'],
          requiredFactsMissing: [],
          forbiddenClaimsFound: [],
          durationMs: 222,
        },
      ],
      failures: [],
    };

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
        buildSummaryPlatformEvents,
        publishPlatformEvent,
        closePlatformAdapter: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => null),
        runSummaryEval: vi.fn(async () => ({
          passed: true,
          report: summaryReport,
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
        runAgentPlanningEval: vi.fn(async () => null),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    expect(result.combinedReport.summary?.report).toEqual(summaryReport);
    expect(buildSummaryPlatformEvents).toHaveBeenCalledWith({
      suiteRunId: expect.stringMatching(/:summary$/),
      baseTags: ['dry-run'],
      report: summaryReport,
    });
    expect(publishPlatformEvent.mock.calls.map(([_, __, event]) => event)).toEqual([
      expect.objectContaining({
        family: 'EvalRunStarted',
        suite: 'summary',
        runId: 'delegated-suite-run',
      }),
    ]);
  });

  it('delegates retrieval platform event construction to the retrieval suite builder', async () => {
    const publishPlatformEvent = vi.fn();
    const buildRetrievalPlatformEvents = vi.fn(async () => [
      {
        family: 'EvalRunStarted' as const,
        suite: 'retrieval' as const,
        tier: 'smoke' as const,
        runId: 'seed:retrieval',
        caseId: null,
        scenarioId: null,
        timestamp: '2026-07-03T00:00:00.000Z',
        tags: ['dry-run'],
        payload: {
          reportMeta: {
            schemaVersion: 1,
            timestamp: '2026-07-03T00:00:05.000Z',
            options: {
              tier: 'smoke' as const,
              dryRun: true,
              allowEmpty: false,
              verbose: 0,
            },
          },
          runScope: {
            tier: 'smoke' as const,
            dryRun: true,
            allowEmpty: false,
            verbose: false,
            caseCount: 1,
            scenarioIds: ['scenario-1'],
          },
        },
      },
    ]);
    const retrievalReport = {
      meta: {
        schemaVersion: 1 as const,
        timestamp: '2026-07-03T00:00:05.000Z',
        durationMs: 5000,
        options: {
          tier: 'smoke' as const,
          dryRun: true,
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
      cases: [],
      failures: [],
      warnings: [],
    };

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
        buildRetrievalPlatformEvents,
        publishPlatformEvent,
        closePlatformAdapter: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => ({
          passed: true,
          report: retrievalReport,
          durationMs: 5000,
          summary: {
            totalCases: 1,
            passedCases: 1,
            failedCases: 0,
            passRate: 1,
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

    expect(result.combinedReport.retrieval?.report).toEqual(retrievalReport);
    expect(buildRetrievalPlatformEvents).toHaveBeenCalledWith({
      suiteRunId: expect.stringMatching(/:retrieval$/),
      baseTags: ['dry-run'],
      report: retrievalReport,
    });
    expect(publishPlatformEvent.mock.calls.map(([_, __, event]) => event)).toEqual([
      expect.objectContaining({
        family: 'EvalRunStarted',
        suite: 'retrieval',
        runId: 'seed:retrieval',
      }),
    ]);
  });

  it('treats suite platform builder throws as warnings after native eval completion', async () => {
    const publishPlatformEvent = vi.fn();
    const closePlatformAdapter = vi.fn();
    const warn = vi.fn();
    const buildRetrievalPlatformEvents = vi.fn(async () => {
      throw new Error('suite builder failed');
    });

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
        buildRetrievalPlatformEvents,
        publishPlatformEvent,
        closePlatformAdapter,
        warn,
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
                dryRun: true,
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
            cases: [],
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
        runSummaryEval: vi.fn(async () => null),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => null),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(buildRetrievalPlatformEvents).toHaveBeenCalledTimes(1);
    expect(publishPlatformEvent).not.toHaveBeenCalled();
    expect(closePlatformAdapter).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('json-archive'),
      expect.objectContaining({ message: 'suite builder failed' }),
    );
  });

  it('mirrors agent-planning case, score, assertion, and trace events from the native report truth source', async () => {
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
        runSummaryEval: vi.fn(async () => null),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => ({
          passed: false,
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
              passedCases: 0,
              failedCases: 1,
              passRate: 0,
              avgScore: 0.4,
            },
            cases: [
              {
                taskId: 'task-identify-cli-workflow',
                variantId: 'task-identify-cli-workflow-skill-summary',
                variantGroupId: 'group-identify-cli-workflow',
                tier: 'smoke',
                taskType: 'selection',
                taskComplexity: 'medium',
                contextSetKind: 'skill-summary-set',
                interferenceLevel: 'low',
                passed: false,
                totalScore: 0.4,
                pathScore: 0.25,
                finalAnswerScore: 0.55,
                actorOutput: 'Plan:\n1. Inspect the CLI entrypoint\n2. Read the workflow skill',
                normalizedPlan: ['Inspect the CLI entrypoint', 'Read the workflow skill'],
                deterministicPrecheck: {
                  passed: false,
                  missingRequiredSteps: ['verify command flags'],
                  missingKeyActions: ['inspect command dispatcher'],
                  forbiddenActionHits: ['edit unrelated files'],
                  emptyOutput: false,
                  parseFailed: false,
                  expectedSkillHitCount: 2,
                  distractorHitCount: 1,
                  capsuleSignalCount: 1,
                },
                judge: {
                  totalScore: 0.4,
                  pathScore: 0.25,
                  finalAnswerScore: 0.55,
                  dimensionScores: [
                    {
                      dimensionId: 'plan-correctness',
                      score: 0.3,
                      rationale: 'Missed the dispatcher verification step',
                    },
                    {
                      dimensionId: 'tool-selection',
                      score: 0.5,
                      rationale: 'Selected one correct skill and one distractor',
                    },
                  ],
                  matchedKeyActions: ['read workflow skill'],
                  missingKeyActions: ['inspect command dispatcher'],
                  forbiddenActionHits: ['edit unrelated files'],
                  summary: 'Partially correct plan with one distractor action.',
                },
                durationMs: 333,
                matchStrategy: 'direct-summary',
                sourceQualityMix: 'repo-only',
              },
            ],
            groups: [],
            slices: [],
          },
          durationMs: 2000,
          summary: {
            totalCases: 1,
            passedCases: 0,
            failedCases: 1,
            passRate: 0,
            avgScore: 0.4,
          },
        })),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    const publishedEvents = publishPlatformEvent.mock.calls.map(([_, __, event]) => event);
    const agentPlanningEvents = publishedEvents.filter((event) => event.suite === 'agent-planning');

    expect(agentPlanningEvents.map((event) => event.family)).toEqual([
      'EvalRunStarted',
      'EvalCaseStarted',
      'EvalCaseFinished',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalTraceStepRecorded',
      'EvalTraceStepRecorded',
      'EvalTraceStepRecorded',
      'EvalRunFinished',
    ]);

    expect(
      agentPlanningEvents
        .filter((event) => event.family === 'EvalCaseStarted')
        .map((event) => [
          event.caseId,
          event.scenarioId,
          event.payload.case.variantId,
          event.payload.case.matchStrategy,
        ]),
    ).toEqual([
      [
        'task-identify-cli-workflow-skill-summary',
        'scenario-identify-cli-workflow',
        'task-identify-cli-workflow-skill-summary',
        'direct-summary',
      ],
    ]);

    expect(
      agentPlanningEvents
        .filter((event) => event.family === 'EvalScoreRecorded')
        .map((event) => [event.payload.scoreId, event.payload.score, event.payload.source]),
    ).toEqual([
      ['totalScore', 0.4, 'case.totalScore'],
      ['pathScore', 0.25, 'case.pathScore'],
      ['finalAnswerScore', 0.55, 'case.finalAnswerScore'],
      ['dimension:plan-correctness', 0.3, 'case.judge.dimensionScores[*].score'],
      ['dimension:tool-selection', 0.5, 'case.judge.dimensionScores[*].score'],
    ]);

    expect(
      agentPlanningEvents
        .filter((event) => event.family === 'EvalAssertionRecorded')
        .map((event) => [
          event.payload.assertionId,
          event.payload.passed,
          event.payload.source,
          event.payload.expected ?? null,
          event.payload.actual ?? null,
        ]),
    ).toEqual([
      [
        'precheck.required-steps',
        false,
        'case.deterministicPrecheck.missingRequiredSteps',
        [],
        ['verify command flags'],
      ],
      [
        'precheck.key-actions',
        false,
        'case.deterministicPrecheck.missingKeyActions',
        [],
        ['inspect command dispatcher'],
      ],
      [
        'precheck.forbidden-actions',
        false,
        'case.deterministicPrecheck.forbiddenActionHits',
        [],
        ['edit unrelated files'],
      ],
      ['precheck.empty-output', true, 'case.deterministicPrecheck.emptyOutput', false, false],
      ['precheck.parse-failed', true, 'case.deterministicPrecheck.parseFailed', false, false],
      [
        'judge.matched-key-actions',
        true,
        'case.judge.matchedKeyActions',
        ['read workflow skill'],
        ['read workflow skill'],
      ],
      [
        'judge.missing-key-actions',
        false,
        'case.judge.missingKeyActions',
        [],
        ['inspect command dispatcher'],
      ],
      [
        'judge.forbidden-action-hits',
        false,
        'case.judge.forbiddenActionHits',
        [],
        ['edit unrelated files'],
      ],
    ]);

    expect(
      agentPlanningEvents
        .filter((event) => event.family === 'EvalTraceStepRecorded')
        .map((event) => [
          event.payload.stepIndex,
          event.payload.kind,
          event.payload.text,
          event.payload.source,
        ]),
    ).toEqual([
      [
        0,
        'actor-output',
        'Plan:\n1. Inspect the CLI entrypoint\n2. Read the workflow skill',
        'case.actorOutput',
      ],
      [0, 'normalized-plan-step', 'Inspect the CLI entrypoint', 'case.normalizedPlan[*]'],
      [1, 'normalized-plan-step', 'Read the workflow skill', 'case.normalizedPlan[*]'],
    ]);
  });

  it('delegates agent-planning platform event construction to the suite layer', async () => {
    const publishPlatformEvent = vi.fn();
    const buildAgentPlanningPlatformEvents = vi.fn(async () => [
      {
        family: 'EvalRunStarted' as const,
        suite: 'agent-planning' as const,
        tier: 'smoke' as const,
        runId: 'seed:agent-planning',
        caseId: null,
        scenarioId: null,
        timestamp: '2026-07-03T00:00:08.000Z',
        tags: ['dry-run'],
        payload: {
          reportMeta: {
            schemaVersion: 1,
            timestamp: '2026-07-03T00:00:10.000Z',
            runner: 'agent-planning' as const,
            options: {
              tier: 'smoke' as const,
              dryRun: true,
              provider: 'fallback' as const,
              promptTemplateId: 'default-agent-planning',
            },
          },
          runScope: {
            tier: 'smoke' as const,
            dryRun: true,
            provider: 'fallback' as const,
            promptTemplateId: 'default-agent-planning',
            caseCount: 1,
            scenarioIds: ['scenario-1'],
          },
        },
      },
    ]);

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
        buildAgentPlanningPlatformEvents,
        publishPlatformEvent,
        closePlatformAdapter: vi.fn(),
        warn: vi.fn(),
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => null),
        runSummaryEval: vi.fn(async () => null),
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
              avgScore: 1,
            },
            cases: [],
            groups: [],
            slices: [],
          },
          durationMs: 2000,
          summary: {
            totalCases: 1,
            passedCases: 1,
            failedCases: 0,
            passRate: 1,
            avgScore: 1,
          },
        })),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    expect(buildAgentPlanningPlatformEvents).toHaveBeenCalledTimes(1);
    expect(publishPlatformEvent).toHaveBeenCalledTimes(1);
    expect(publishPlatformEvent.mock.calls[0]?.[2]).toMatchObject({
      suite: 'agent-planning',
      runId: 'seed:agent-planning',
    });
  });
});
