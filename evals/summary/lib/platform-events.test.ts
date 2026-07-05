import { describe, expect, it, vi } from 'vitest';
import type { SummaryEvalReport } from '../../../packages/contracts/src/domain/evals/report.js';

vi.mock('./runner-api.js', () => ({
  getSummaryEvaluationCases: vi.fn(() => [
    {
      schemaVersion: 1,
      caseId: 'summary-grounded-smoke',
      scenarioId: 'scenario-grounded',
      endpoint: '/v2/retrieval/search',
      tier: 'smoke',
      request: { query: 'docker compose' },
      expected: {
        requiredFacts: ['docker-compose', 'multi-container'],
        forbiddenClaims: [],
        minGroundedness: 0.8,
        minCoverage: 0.7,
        expectSummary: true,
      },
      tags: ['grounded'],
    },
    {
      schemaVersion: 1,
      caseId: 'summary-hallucination-smoke',
      scenarioId: 'scenario-hallucination',
      endpoint: '/v2/retrieval/search',
      tier: 'smoke',
      request: { query: 'einstein docker' },
      expected: {
        requiredFacts: [],
        forbiddenClaims: ['Einstein'],
        minGroundedness: 0.5,
        minCoverage: 0.7,
        expectSummary: true,
      },
      tags: ['hallucination'],
    },
  ]),
  getSummaryScenarioIds: vi.fn(() => ['scenario-grounded', 'scenario-hallucination']),
}));

import { buildSummaryPlatformEvents } from './platform-events.js';

describe('buildSummaryPlatformEvents', () => {
  it('builds summary suite-owned platform events from the report truth source', async () => {
    const report: SummaryEvalReport = {
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
    };

    const events = await buildSummaryPlatformEvents({
      suiteRunId: 'platform-run-1:summary',
      baseTags: ['dry-run'],
      report,
    });

    expect(events.map((event) => event.family)).toEqual([
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

    expect(events[0]).toMatchObject({
      family: 'EvalRunStarted',
      suite: 'summary',
      runId: 'platform-run-1:summary',
      payload: {
        runScope: {
          scenarioIds: ['scenario-grounded', 'scenario-hallucination'],
          caseCount: 2,
          provider: 'fallback',
        },
      },
    });

    expect(
      events
        .filter((event) => event.family === 'EvalAssertionRecorded')
        .map((event) => ({
          caseId: event.caseId,
          assertionId: event.payload.assertionId,
          passed: event.payload.passed,
          reason: 'reason' in event.payload ? event.payload.reason : undefined,
        })),
    ).toEqual([
      {
        caseId: 'summary-grounded-smoke',
        assertionId: 'summary-present',
        passed: true,
        reason: undefined,
      },
      {
        caseId: 'summary-grounded-smoke',
        assertionId: 'groundedness',
        passed: true,
        reason: undefined,
      },
      {
        caseId: 'summary-grounded-smoke',
        assertionId: 'coverage',
        passed: true,
        reason: undefined,
      },
      {
        caseId: 'summary-grounded-smoke',
        assertionId: 'forbidden-claims',
        passed: true,
        reason: undefined,
      },
      {
        caseId: 'summary-hallucination-smoke',
        assertionId: 'summary-present',
        passed: true,
        reason: undefined,
      },
      {
        caseId: 'summary-hallucination-smoke',
        assertionId: 'groundedness',
        passed: false,
        reason: 'Groundedness score 0.25 below minimum 0.50',
      },
      {
        caseId: 'summary-hallucination-smoke',
        assertionId: 'coverage',
        passed: true,
        reason: undefined,
      },
      {
        caseId: 'summary-hallucination-smoke',
        assertionId: 'forbidden-claims',
        passed: false,
        reason: 'Forbidden claim found: "Einstein"',
      },
    ]);
  });
});
