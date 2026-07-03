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
});
