/**
 * Tests for CI eval script pure functions.
 *
 * Since compareWithBaseline, formatCompactSummary, and formatRegressionResult
 * are not exported from eval-ci.ts, we test the same logic by importing
 * the schemas and building the comparison manually. If these functions
 * are exported in the future, switch to direct imports.
 *
 * For now we test the contract types and formatting logic indirectly.
 */

import { describe, expect, it } from 'vitest';
import type {
  BaselineReport,
  RegressionResult,
  RegressionThresholds,
  RetrievalEvalReport,
} from '../../../packages/contracts/src/domain/evals/report.js';
import {
  TIER_THRESHOLDS,
  regressionResultSchema,
} from '../../../packages/contracts/src/domain/evals/report.js';

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
// compareWithBaseline logic (inline recreation since function is not exported)
// ---------------------------------------------------------------------------

function compareWithBaseline(
  report: RetrievalEvalReport,
  baseline: BaselineReport,
  thresholds: RegressionThresholds,
): RegressionResult {
  const regressedSlices: RegressionResult['regressedSlices'] = [];
  const improvedSlices: RegressionResult['improvedSlices'] = [];
  const regressedCohorts: RegressionResult['regressedCohorts'] = [];

  for (const currentSlice of report.slices) {
    const key = `${currentSlice.slice.tier}:${currentSlice.slice.endpoint}:${currentSlice.slice.mode ?? 'none'}`;
    const baselineSlice = baseline.slices.find(
      (s) => `${s.slice.tier}:${s.slice.endpoint}:${s.slice.mode ?? 'none'}` === key,
    );
    if (baselineSlice) {
      const hitAt1Delta = currentSlice.avgHitAt1 - baselineSlice.avgHitAt1;
      const mrrDelta = currentSlice.avgMrr - baselineSlice.avgMrr;
      if (hitAt1Delta < thresholds.hitAt1Threshold || mrrDelta < thresholds.mrrThreshold) {
        regressedSlices.push({
          slice: currentSlice.slice,
          baselineHitAt1: baselineSlice.avgHitAt1,
          currentHitAt1: currentSlice.avgHitAt1,
          hitAt1Delta,
          baselineMrr: baselineSlice.avgMrr,
          currentMrr: currentSlice.avgMrr,
          mrrDelta,
        });
      } else if (
        hitAt1Delta > Math.abs(thresholds.hitAt1Threshold) ||
        mrrDelta > Math.abs(thresholds.mrrThreshold)
      ) {
        improvedSlices.push({
          slice: currentSlice.slice,
          baselineHitAt1: baselineSlice.avgHitAt1,
          currentHitAt1: currentSlice.avgHitAt1,
          hitAt1Delta,
          baselineMrr: baselineSlice.avgMrr,
          currentMrr: currentSlice.avgMrr,
          mrrDelta,
        });
      }
    }
  }

  if (report.cohorts && baseline.cohorts) {
    for (const currentCohort of report.cohorts) {
      const key = `${currentCohort.cohort.queryType}:${currentCohort.cohort.routeFamily}`;
      const baselineCohort = baseline.cohorts.find(
        (c) => `${c.cohort.queryType}:${c.cohort.routeFamily}` === key,
      );
      if (baselineCohort) {
        const hitAt1Delta = currentCohort.avgHitAt1 - baselineCohort.avgHitAt1;
        if (hitAt1Delta < thresholds.hitAt1Threshold) {
          regressedCohorts.push({
            cohort: currentCohort.cohort,
            baselineHitAt1: baselineCohort.avgHitAt1,
            currentHitAt1: currentCohort.avgHitAt1,
            hitAt1Delta,
          });
        }
      }
    }
  }

  const governanceRegressions = Math.max(
    0,
    report.failures.filter((f) => f.kind === 'forbidden-hit').length -
      baseline.governanceFailures.length,
  );

  const hasRegressions =
    regressedSlices.length > 0 ||
    regressedCohorts.length > 0 ||
    governanceRegressions > thresholds.maxGovernanceIncrease;

  return regressionResultSchema.parse({
    hasRegressions,
    regressedSlices,
    improvedSlices,
    regressedCohorts,
    governanceRegressions,
    baselineAvailable: true,
    baselineTimestamp: baseline.timestamp,
  });
}

// ---------------------------------------------------------------------------
// formatRegressionResult (inline recreation)
// ---------------------------------------------------------------------------

function formatRegressionResult(regression: RegressionResult): string {
  const lines: string[] = [];
  if (!regression.baselineAvailable) {
    return 'No baseline available for comparison.';
  }
  lines.push(`Baseline timestamp: ${regression.baselineTimestamp}`);
  lines.push('');
  if (regression.regressedSlices.length > 0) {
    lines.push('=== REGRESSED SLICES ===');
    for (const s of regression.regressedSlices) {
      const mode = s.slice.mode ?? 'default';
      lines.push(`  ${s.slice.endpoint} (${mode}):`);
      lines.push(
        `    Hit@1: ${s.baselineHitAt1.toFixed(3)} -> ${s.currentHitAt1.toFixed(3)} (${s.hitAt1Delta >= 0 ? '+' : ''}${s.hitAt1Delta.toFixed(3)})`,
      );
      lines.push(
        `    MRR:   ${s.baselineMrr.toFixed(3)} -> ${s.currentMrr.toFixed(3)} (${s.mrrDelta >= 0 ? '+' : ''}${s.mrrDelta.toFixed(3)})`,
      );
    }
    lines.push('');
  }
  if (regression.improvedSlices.length > 0) {
    lines.push('=== IMPROVED SLICES ===');
    for (const s of regression.improvedSlices) {
      const mode = s.slice.mode ?? 'default';
      lines.push(`  ${s.slice.endpoint} (${mode}):`);
      lines.push(
        `    Hit@1: ${s.baselineHitAt1.toFixed(3)} -> ${s.currentHitAt1.toFixed(3)} (+${s.hitAt1Delta.toFixed(3)})`,
      );
    }
    lines.push('');
  }
  if (regression.governanceRegressions > 0) {
    lines.push(`Governance regressions: +${regression.governanceRegressions}`);
    lines.push('');
  }
  lines.push(
    `Summary: ${regression.regressedSlices.length} regressed, ${regression.improvedSlices.length} improved`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// formatCompactSummary (inline recreation)
// ---------------------------------------------------------------------------

function formatCompactSummary(report: {
  overall: { passed: boolean; passedCases: number; totalCases: number };
  retrieval: { summary: { passedCases: number; totalCases: number } } | null;
  summary: {
    summary: {
      passedCases: number;
      totalCases: number;
      avgGroundedness: number;
      avgCoverage: number;
    };
  } | null;
}): string {
  const status = report.overall.passed ? 'PASS' : 'FAIL';
  let details = '';
  if (report.retrieval) {
    details += `Retrieval: ${report.retrieval.summary.passedCases}/${report.retrieval.summary.totalCases}`;
  }
  if (report.summary) {
    const sum = report.summary.summary;
    if (details) details += ' | ';
    details += `Summary: ${sum.passedCases}/${sum.totalCases} (G=${sum.avgGroundedness.toFixed(2)} C=${sum.avgCoverage.toFixed(2)})`;
  }
  return `[${status}] ${report.overall.passedCases}/${report.overall.totalCases} cases passed | ${details}`;
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
  it('formats passing report with both eval types', () => {
    const output = formatCompactSummary({
      overall: { passed: true, passedCases: 10, totalCases: 10 },
      retrieval: { summary: { passedCases: 5, totalCases: 5 } },
      summary: {
        summary: {
          passedCases: 5,
          totalCases: 5,
          avgGroundedness: 0.95,
          avgCoverage: 0.88,
        },
      },
    });

    expect(output).toContain('[PASS]');
    expect(output).toContain('10/10');
    expect(output).toContain('Retrieval: 5/5');
    expect(output).toContain('Summary: 5/5');
    expect(output).toContain('G=0.95');
    expect(output).toContain('C=0.88');
  });

  it('formats failing report', () => {
    const output = formatCompactSummary({
      overall: { passed: false, passedCases: 7, totalCases: 10 },
      retrieval: { summary: { passedCases: 4, totalCases: 5 } },
      summary: {
        summary: {
          passedCases: 3,
          totalCases: 5,
          avgGroundedness: 0.6,
          avgCoverage: 0.5,
        },
      },
    });

    expect(output).toContain('[FAIL]');
    expect(output).toContain('7/10');
  });

  it('handles null retrieval and summary sections', () => {
    const output = formatCompactSummary({
      overall: { passed: true, passedCases: 0, totalCases: 0 },
      retrieval: null,
      summary: null,
    });

    expect(output).toContain('[PASS]');
    expect(output).toContain('0/0');
  });
});
