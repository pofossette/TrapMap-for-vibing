import { describe, expect, it, vi } from 'vitest';
import type { RetrievalEvalReport } from '../../types/report.js';

vi.mock('./runner-api.js', () => ({
  getRetrievalEvaluationCases: vi.fn(() => [
    {
      schemaVersion: 1,
      caseId: 'v2-capsule-positive-smoke',
      scenarioId: 'scenario-positive',
      endpoint: '/v2/retrieval/search',
      tier: 'smoke',
      request: { query: 'docker compose', mode: 'hybrid' },
      expected: {
        outcome: 'non-empty',
        relevance: {
          relevantIds: ['doc-1'],
          idealOrder: ['doc-1'],
        },
      },
      tags: ['capsule'],
    },
    {
      schemaVersion: 1,
      caseId: 'v3-graph-plan-selected-smoke',
      scenarioId: 'scenario-graph-plan',
      endpoint: '/v3/retrieval/search',
      tier: 'smoke',
      request: { query: 'skill graph', mode: 'hybrid' },
      expected: {
        outcome: 'non-empty',
        relevance: {
          relevantIds: ['doc-2'],
          idealOrder: ['doc-2'],
        },
      },
      tags: ['graph-plan'],
    },
  ]),
  getRetrievalScenarioIds: vi.fn(() => ['scenario-graph-plan', 'scenario-positive']),
}));

import { buildRetrievalPlatformEvents } from './platform-events.js';

describe('buildRetrievalPlatformEvents', () => {
  it('builds retrieval suite-owned platform events from retrieval report truth', async () => {
    const report: RetrievalEvalReport = {
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
    };

    const events = await buildRetrievalPlatformEvents({
      suiteRunId: 'platform-run-1:retrieval',
      baseTags: ['dry-run'],
      report,
    });

    expect(events.map((event) => event.family)).toEqual([
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

    expect(events[0]).toMatchObject({
      family: 'EvalRunStarted',
      suite: 'retrieval',
      runId: 'platform-run-1:retrieval',
      payload: {
        runScope: {
          scenarioIds: ['scenario-graph-plan', 'scenario-positive'],
          caseCount: 2,
        },
      },
    });

    expect(
      events
        .filter(
          (event) =>
            event.family === 'EvalScoreRecorded' && event.caseId === 'v2-capsule-positive-smoke',
        )
        .map((event) => event.payload.scoreId),
    ).toEqual(['hitAt1', 'hitAt5', 'hitAt10', 'mrr', 'ndcg', 'recallAt10']);

    expect(
      events
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
      events
        .filter(
          (event) =>
            event.family === 'EvalAssertionRecorded' &&
            event.caseId === 'v3-graph-plan-selected-smoke',
        )
        .map((event) => [
          event.payload.assertionId,
          event.payload.passed,
          event.payload.source,
          event.payload.reason ?? null,
        ]),
    ).toEqual([
      ['outcome', true, 'case.outcomeMatch', null],
      ['governance', true, 'case.governancePassed', null],
      ['graph-plan', false, 'case.passed', 'Expected edge trap->skill not found'],
    ]);
  });

  it('does not falsely fail v3 graph-plan assertions for governance-only failures', async () => {
    const report: RetrievalEvalReport = {
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
        totalCases: 1,
        passedCases: 0,
        failedCases: 1,
        passRate: 0,
        passed: false,
      },
      slices: [],
      cohorts: [],
      modeComparisons: [],
      routingDistribution: [],
      cases: [
        {
          caseId: 'v3-graph-plan-selected-smoke',
          endpoint: '/v3/retrieval/search',
          tier: 'smoke',
          passed: false,
          outcomeMatch: true,
          governancePassed: false,
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
          kind: 'forbidden-hit',
          description: 'Forbidden skill leaked into retrieval hits',
          ids: ['skill-forbidden-1'],
          endpoint: '/v3/retrieval/search',
          tier: 'smoke',
        },
      ],
      warnings: [],
    };

    const events = await buildRetrievalPlatformEvents({
      suiteRunId: 'platform-run-2:retrieval',
      baseTags: [],
      report,
    });

    expect(
      events.filter(
        (event) =>
          event.family === 'EvalAssertionRecorded' &&
          event.caseId === 'v3-graph-plan-selected-smoke',
      ),
    ).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          assertionId: 'graph-plan',
          passed: true,
          source: 'case.passed',
        }),
      }),
    );
  });
});
