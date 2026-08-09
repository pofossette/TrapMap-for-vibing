/**
 * Tests for summary evaluation verdicts and report building.
 *
 * Covers: evaluateSummaryVerdicts, buildSummaryReport. The native
 * `runSummaryEvaluation` execution loop was removed in the promptfoo cutover
 * (execution now runs through the `summaryBridge`).
 */

import { describe, expect, it } from 'vitest';

import { evaluateSummaryVerdicts } from '../lib/assertions.js';
import { buildSummaryReport } from '../lib/report.js';
import type { SummaryCaseResult } from '../lib/types.js';

// ---------------------------------------------------------------------------
// evaluateSummaryVerdicts
// ---------------------------------------------------------------------------

describe('evaluateSummaryVerdicts', () => {
  const baseCase = {
    caseId: 'test-1',
    scenarioId: 'scenario-1',
    endpoint: '/v1/retrieval/search' as const,
    tier: 'smoke' as const,
    request: { query: 'test' },
    expected: {
      requiredFacts: ['Docker'],
      forbiddenClaims: [],
      minGroundedness: 0.8,
      minCoverage: 0.7,
    },
  };

  const baseJudgeResult = {
    claims: [{ text: 'Docker is a container tool', supported: true }],
    groundednessScore: 1.0,
    coverageScore: 1.0,
    requiredFactsCovered: ['Docker'],
    requiredFactsMissing: [],
    forbiddenClaimsFound: [],
    provider: 'fallback' as const,
  };

  it('passes when all scores meet thresholds', () => {
    const { verdicts, passed } = evaluateSummaryVerdicts({
      case_: baseCase,
      judgeResult: baseJudgeResult,
    });

    expect(passed).toBe(true);
    expect(verdicts.every((v) => v.passed)).toBe(true);
  });

  it('fails when groundedness is below threshold', () => {
    const { verdicts, passed } = evaluateSummaryVerdicts({
      case_: baseCase,
      judgeResult: { ...baseJudgeResult, groundednessScore: 0.5 },
    });

    expect(passed).toBe(false);
    const g = verdicts.find((v) => v.kind === 'groundedness');
    expect(g?.passed).toBe(false);
    expect(g?.failure?.kind).toBe('groundedness-below-threshold');
  });

  it('fails when coverage is below threshold', () => {
    const { verdicts, passed } = evaluateSummaryVerdicts({
      case_: baseCase,
      judgeResult: { ...baseJudgeResult, coverageScore: 0.3 },
    });

    expect(passed).toBe(false);
    const c = verdicts.find((v) => v.kind === 'coverage');
    expect(c?.passed).toBe(false);
    expect(c?.failure?.kind).toBe('coverage-below-threshold');
  });

  it('fails when forbidden claims are found', () => {
    const { verdicts, passed } = evaluateSummaryVerdicts({
      case_: baseCase,
      judgeResult: { ...baseJudgeResult, forbiddenClaimsFound: ['password'] },
    });

    expect(passed).toBe(false);
    const f = verdicts.find((v) => v.kind === 'forbidden');
    expect(f?.passed).toBe(false);
    expect(f?.failure?.kind).toBe('forbidden-claim-found');
  });

  it('uses default thresholds when case does not specify them', () => {
    const caseNoThresholds = {
      ...baseCase,
      expected: {
        requiredFacts: ['Docker'],
        forbiddenClaims: [],
      },
    };
    // Default minGroundedness=0.8, minCoverage=0.7
    const { verdicts, passed } = evaluateSummaryVerdicts({
      case_: caseNoThresholds,
      judgeResult: { ...baseJudgeResult, groundednessScore: 0.75, coverageScore: 0.65 },
    });

    expect(passed).toBe(false);
    expect(verdicts.find((v) => v.kind === 'groundedness')?.passed).toBe(false);
    expect(verdicts.find((v) => v.kind === 'coverage')?.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSummaryReport
// ---------------------------------------------------------------------------

describe('buildSummaryReport', () => {
  function makeResult(overrides: Partial<SummaryCaseResult> = {}): SummaryCaseResult {
    return {
      case: {
        caseId: 'test-1',
        scenarioId: 'scenario-1',
        endpoint: '/v1/retrieval/search',
        tier: 'smoke',
        request: { query: 'test' },
        expected: {
          requiredFacts: ['Docker'],
          forbiddenClaims: [],
          minGroundedness: 0.8,
          minCoverage: 0.7,
        },
      },
      judgeResult: {
        claims: [{ text: 'claim', supported: true }],
        groundednessScore: 1.0,
        coverageScore: 1.0,
        requiredFactsCovered: ['Docker'],
        requiredFactsMissing: [],
        forbiddenClaimsFound: [],
        provider: 'fallback',
      },
      passed: true,
      durationMs: 100,
      warnings: [],
      contextTrace: ['ctx'],
      summaryText: 'summary',
      ...overrides,
    };
  }

  const baseOptions = {
    tier: 'smoke' as const,
    json: false,
    allowEmpty: false,
    dryRun: false,
    verbose: 0,
  };

  it('builds report for all-passing cases', () => {
    const report = buildSummaryReport({
      caseResults: [
        makeResult(),
        makeResult({
          case: {
            ...makeResult().case,
            caseId: 'test-2',
            scenarioId: 's2',
            endpoint: '/v2/retrieval/search',
            tier: 'smoke',
            request: { query: 'q' },
            expected: { requiredFacts: [], forbiddenClaims: [] },
          },
        }),
      ],
      options: baseOptions,
      durationMs: 200,
      llmProvider: 'fallback',
    });

    expect(report.summary.totalCases).toBe(2);
    expect(report.summary.passedCases).toBe(2);
    expect(report.summary.failedCases).toBe(0);
    expect(report.summary.passRate).toBe(1);
    expect(report.summary.passed).toBe(true);
  });

  it('builds report with failures', () => {
    const report = buildSummaryReport({
      caseResults: [
        makeResult(),
        makeResult({
          passed: false,
          judgeResult: {
            ...makeResult().judgeResult,
            groundednessScore: 0.3,
            forbiddenClaimsFound: ['secret'],
          },
        }),
      ],
      options: baseOptions,
      durationMs: 200,
      llmProvider: 'fallback',
    });

    expect(report.summary.totalCases).toBe(2);
    expect(report.summary.passedCases).toBe(1);
    expect(report.summary.failedCases).toBe(1);
    expect(report.summary.passed).toBe(false);
    expect(report.failures.length).toBeGreaterThan(0);
  });

  it('calculates average scores', () => {
    const report = buildSummaryReport({
      caseResults: [
        makeResult({
          judgeResult: { ...makeResult().judgeResult, groundednessScore: 0.8, coverageScore: 0.6 },
        }),
        makeResult({
          judgeResult: { ...makeResult().judgeResult, groundednessScore: 1.0, coverageScore: 1.0 },
        }),
      ],
      options: baseOptions,
      durationMs: 100,
      llmProvider: 'fallback',
    });

    expect(report.summary.avgGroundedness).toBeCloseTo(0.9);
    expect(report.summary.avgCoverage).toBeCloseTo(0.8);
  });

  it('counts forbidden claim hits', () => {
    const report = buildSummaryReport({
      caseResults: [
        makeResult({
          judgeResult: { ...makeResult().judgeResult, forbiddenClaimsFound: ['a', 'b'] },
        }),
        makeResult({ judgeResult: { ...makeResult().judgeResult, forbiddenClaimsFound: ['c'] } }),
      ],
      options: baseOptions,
      durationMs: 100,
      llmProvider: 'fallback',
    });

    expect(report.summary.forbiddenClaimHits).toBe(3);
  });

  it('sorts cases by caseId', () => {
    const report = buildSummaryReport({
      caseResults: [
        makeResult({ case: { ...makeResult().case, caseId: 'z-case' } }),
        makeResult({ case: { ...makeResult().case, caseId: 'a-case' } }),
      ],
      options: baseOptions,
      durationMs: 100,
      llmProvider: 'fallback',
    });

    expect(report.cases[0].caseId).toBe('a-case');
    expect(report.cases[1].caseId).toBe('z-case');
  });
});
