/**
 * Tests for CI eval script pure functions (compareWithBaseline,
 * formatRegressionResult, and formatCompactSummary), imported directly from
 * eval-ci.ts.
 */

import { describe, expect, it } from 'vitest';
import type { BaselineReport, RegressionResult, RetrievalEvalReport } from '../../types/report.js';
import { TIER_THRESHOLDS } from '../../types/report.js';
import {
  type CIReport,
  compareWithBaseline,
  formatCompactSummary,
  formatRegressionResult,
} from '../eval-ci.js';

// ---------------------------------------------------------------------------
// Helpers to build minimal report/baseline objects
// ---------------------------------------------------------------------------

function makeSlice(overrides: Record<string, unknown> = {}) {
  return {
    slice: {
      tier: 'smoke' as string,
      endpoint: '/v1/retrieval/search' as string,
      mode: undefined as string | undefined,
    },
    routeFamily: 'search',
    avgHitAt1: 0.8,
    avgHitAt5: 0.9,
    avgHitAt10: 1.0,
    avgMrr: 0.85,
    avgNdcg: 0.88,
    avgRecallAt10: 1.0,
    selectedMode: 'default',
    fallbackApplied: false,
    passRate: 1.0,
    caseCount: 5,
    ...overrides,
  };
}

function makeBaselineSlice(overrides: Record<string, unknown> = {}) {
  return {
    slice: {
      tier: 'smoke' as string,
      endpoint: '/v1/retrieval/search' as string,
      mode: undefined as string | undefined,
    },
    routeFamily: 'search',
    avgHitAt1: 0.8,
    avgHitAt5: 0.9,
    avgHitAt10: 1.0,
    avgMrr: 0.85,
    avgNdcg: 0.88,
    avgRecallAt10: 1.0,
    selectedMode: 'default',
    fallbackApplied: false,
    passRate: 1.0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compareWithBaseline', () => {
  const thresholds = TIER_THRESHOLDS.smoke;

  function makeReport(slices: ReturnType<typeof makeSlice>[]): RetrievalEvalReport {
    return {
      meta: {
        schemaVersion: 1,
        timestamp: '2026-01-01T00:00:00.000Z',
        durationMs: 1000,
        tier: 'smoke',
        options: { tier: 'smoke', dryRun: false, allowEmpty: false, verbose: 0 },
      },
      summary: {
        totalCases: 10,
        passedCases: 10,
        failedCases: 0,
        passRate: 1.0,
        passed: true,
        avgHitAt1: 0.8,
        avgMrr: 0.85,
      },
      slices,
      cohorts: [],
      failures: [],
    } as unknown as RetrievalEvalReport;
  }

  function makeBaseline(slices: ReturnType<typeof makeBaselineSlice>[]): BaselineReport {
    return {
      schemaVersion: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      tier: 'smoke',
      slices,
      cohorts: [],
      governanceFailures: [],
      totalCases: 10,
      passedCases: 10,
      passRate: 1.0,
      durationMs: 1000,
    };
  }

  it('detects regressed slice when Hit@1 drops', () => {
    const report = makeReport([makeSlice({ avgHitAt1: 0.5, avgMrr: 0.85 })]);
    const baseline = makeBaseline([makeBaselineSlice({ avgHitAt1: 0.9, avgMrr: 0.85 })]);

    const result = compareWithBaseline(report, baseline, thresholds);

    expect(result.hasRegressions).toBe(true);
    expect(result.regressedSlices).toHaveLength(1);
    expect(result.regressedSlices[0].hitAt1Delta).toBeCloseTo(-0.4);
  });

  it('detects improved slice when Hit@1 rises significantly', () => {
    const report = makeReport([makeSlice({ avgHitAt1: 1.0, avgMrr: 0.99 })]);
    const baseline = makeBaseline([makeBaselineSlice({ avgHitAt1: 0.5, avgMrr: 0.5 })]);

    const result = compareWithBaseline(report, baseline, thresholds);

    expect(result.hasRegressions).toBe(false);
    expect(result.improvedSlices.length).toBeGreaterThanOrEqual(1);
  });

  it('reports no regression when scores are stable', () => {
    const report = makeReport([makeSlice()]);
    const baseline = makeBaseline([makeBaselineSlice()]);

    const result = compareWithBaseline(report, baseline, thresholds);

    expect(result.hasRegressions).toBe(false);
    expect(result.regressedSlices).toHaveLength(0);
  });

  it('handles missing baseline slice gracefully', () => {
    const slice = makeSlice();
    slice.slice = { ...slice.slice, endpoint: '/v1/retrieval/graph/plan' };
    const report = makeReport([slice]);
    const baseline = makeBaseline([makeBaselineSlice()]); // different endpoint

    const result = compareWithBaseline(report, baseline, thresholds);

    expect(result.hasRegressions).toBe(false);
    expect(result.regressedSlices).toHaveLength(0);
    expect(result.improvedSlices).toHaveLength(0);
  });
});

describe('formatRegressionResult', () => {
  it('formats regressed slices', () => {
    const regression: RegressionResult = {
      hasRegressions: true,
      regressedSlices: [
        {
          slice: { tier: 'smoke', endpoint: '/v1/retrieval/search' },
          baselineHitAt1: 0.9,
          currentHitAt1: 0.5,
          hitAt1Delta: -0.4,
          baselineMrr: 0.85,
          currentMrr: 0.6,
          mrrDelta: -0.25,
        },
      ],
      improvedSlices: [],
      regressedCohorts: [],
      governanceRegressions: 0,
      baselineAvailable: true,
      baselineTimestamp: '2026-01-01T00:00:00.000Z',
    };

    const output = formatRegressionResult(regression);
    expect(output).toContain('REGRESSED SLICES');
    expect(output).toContain('/v1/retrieval/search');
    expect(output).toContain('-0.400');
    expect(output).toContain('1 regressed, 0 improved');
  });

  it('formats improved slices', () => {
    const regression: RegressionResult = {
      hasRegressions: false,
      regressedSlices: [],
      improvedSlices: [
        {
          slice: { tier: 'smoke', endpoint: '/v1/retrieval/search' },
          baselineHitAt1: 0.5,
          currentHitAt1: 0.9,
          hitAt1Delta: 0.4,
          baselineMrr: 0.5,
          currentMrr: 0.85,
          mrrDelta: 0.35,
        },
      ],
      regressedCohorts: [],
      governanceRegressions: 0,
      baselineAvailable: true,
      baselineTimestamp: '2026-01-01T00:00:00.000Z',
    };

    const output = formatRegressionResult(regression);
    expect(output).toContain('IMPROVED SLICES');
    expect(output).toContain('0 regressed, 1 improved');
  });

  it('handles no baseline available', () => {
    const regression = {
      hasRegressions: false,
      regressedSlices: [],
      improvedSlices: [],
      regressedCohorts: [],
      governanceRegressions: 0,
      baselineAvailable: false,
    } as unknown as RegressionResult;

    const output = formatRegressionResult(regression);
    expect(output).toContain('No baseline available');
  });
});

describe('formatCompactSummary', () => {
  function makeReport(overrides: Partial<CIReport> = {}): CIReport {
    return {
      schemaVersion: 1,
      timestamp: '2026-01-01T00:00:00.000Z',
      durationMs: 1000,
      tier: 'smoke',
      retrieval: {
        passed: true,
        report: null,
        durationMs: 500,
        summary: {
          totalCases: 5,
          passedCases: 5,
          failedCases: 0,
          passRate: 1,
          slices: [],
        },
      },
      summary: {
        passed: true,
        report: null,
        durationMs: 500,
        summary: {
          totalCases: 5,
          passedCases: 5,
          failedCases: 0,
          passRate: 1,
          avgGroundedness: 0.95,
          avgCoverage: 0.88,
          forbiddenClaimHits: 0,
        },
      },
      overall: { passed: true, totalCases: 10, passedCases: 10, failedCases: 0 },
      ...overrides,
    };
  }

  it('formats passing report with both eval types', () => {
    const output = formatCompactSummary(makeReport());

    expect(output).toContain('[PASS]');
    expect(output).toContain('10/10');
    expect(output).toContain('Retrieval: 5/5');
    expect(output).toContain('Summary: 5/5');
    expect(output).toContain('G=0.95');
    expect(output).toContain('C=0.88');
  });

  it('formats failing report', () => {
    const output = formatCompactSummary(
      makeReport({
        retrieval: {
          passed: false,
          report: null,
          durationMs: 500,
          summary: {
            totalCases: 5,
            passedCases: 4,
            failedCases: 1,
            passRate: 0.8,
            slices: [],
          },
        },
        summary: {
          passed: false,
          report: null,
          durationMs: 500,
          summary: {
            totalCases: 5,
            passedCases: 3,
            failedCases: 2,
            passRate: 0.6,
            avgGroundedness: 0.6,
            avgCoverage: 0.5,
            forbiddenClaimHits: 1,
          },
        },
        overall: { passed: false, totalCases: 10, passedCases: 7, failedCases: 3 },
      }),
    );

    expect(output).toContain('[FAIL]');
    expect(output).toContain('7/10');
  });

  it('handles null retrieval and summary sections', () => {
    const output = formatCompactSummary(
      makeReport({
        retrieval: null,
        summary: null,
        overall: { passed: true, totalCases: 0, passedCases: 0, failedCases: 0 },
      }),
    );

    expect(output).toContain('[PASS]');
    expect(output).toContain('0/0');
  });
});
