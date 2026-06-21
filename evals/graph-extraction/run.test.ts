import { describe, expect, it } from 'vitest';

import type { AggregateMetrics, CaseMetrics } from './run.js';
import { aggregateMetrics, evaluateCase, formatReport, performLLMExtraction } from './run.js';

function stubCaseMetrics(
  overrides: Partial<CaseMetrics> & Pick<CaseMetrics, 'caseId' | 'mode' | 'degraded'>,
): CaseMetrics {
  return {
    nodeMetrics: { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 },
    edgeMetrics: { tp: 0, fp: 0, fn: 0, precision: 0, recall: 0, f1: 0 },
    strengthAccuracy: 0,
    totalExpectedStrengths: 0,
    correctStrengths: 0,
    warning: null,
    ...overrides,
  };
}

function stubAggregateMetrics(overrides: Partial<AggregateMetrics> = {}): AggregateMetrics {
  return {
    avgNodePrecision: 0,
    avgNodeRecall: 0,
    avgNodeF1: 0,
    avgEdgePrecision: 0,
    avgEdgeRecall: 0,
    avgEdgeF1: 0,
    avgStrengthAccuracy: 0,
    totalCases: 1,
    totalNodeTP: 0,
    totalNodeFP: 0,
    totalNodeFN: 0,
    totalEdgeTP: 0,
    totalEdgeFP: 0,
    totalEdgeFN: 0,
    modeBreakdown: { live: 0, unavailable: 1, error: 0, empty: 0 },
    degradedCount: 0,
    warnings: [],
    ...overrides,
  };
}

describe('performLLMExtraction', () => {
  it('returns unavailable mode in dry-run mode', async () => {
    const result = await performLLMExtraction('some text about docker and timeout', true);

    expect(result.mode).toBe('unavailable');
    expect(result.degraded).toBe(true);
    expect(result.warning).toBe('dry-run-no-llm');
    expect(result.extraction).toEqual({ nodes: [], edges: [] });
  });
});

describe('evaluateCase', () => {
  it('passes through unavailable mode from extraction result', async () => {
    const fixture = {
      id: 'test',
      input: 'docker timeout error',
      expectedNodes: [
        { kind: 'tool' as const, label: 'docker' },
        { kind: 'cue' as const, label: 'timeout-issue' },
      ],
      expectedEdges: [],
    };

    const result = await evaluateCase(fixture, true);

    expect(result.mode).toBe('unavailable');
    expect(result.degraded).toBe(true);
    expect(result.warning).toBe('dry-run-no-llm');
    expect(result.caseId).toBe('test');
  });
});

describe('formatReport', () => {
  it('shows dry-run label for dry-run reports', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-1', mode: 'unavailable', degraded: true }),
    ];
    const agg = stubAggregateMetrics();

    const output = formatReport(results, agg, [], stubAggregateMetrics({ totalCases: 0 }), true);

    expect(output).toContain('DRY-RUN');
  });

  it('shows degraded warning when degradedCount > 0', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-1', mode: 'error', degraded: true }),
    ];
    const agg = stubAggregateMetrics({
      modeBreakdown: { live: 0, unavailable: 0, error: 1, empty: 0 },
      degradedCount: 1,
      warnings: ['llm-extraction-failed'],
    });

    const output = formatReport(results, agg, [], stubAggregateMetrics({ totalCases: 0 }), false);

    expect(output).toContain('DEGRADED');
    expect(output).toContain('Error: 1');
  });

  it('shows per-case mode indicators', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-live', mode: 'live', degraded: false }),
      stubCaseMetrics({ caseId: 'case-empty', mode: 'empty', degraded: true }),
    ];
    const agg = stubAggregateMetrics({
      totalCases: 2,
      modeBreakdown: { live: 1, unavailable: 0, error: 0, empty: 1 },
    });

    const output = formatReport(results, agg, [], stubAggregateMetrics({ totalCases: 0 }), false);

    expect(output).toContain('case-live');
    expect(output).toContain('case-empty');
  });
});

describe('aggregateMetrics', () => {
  it('computes mode breakdown from case results', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'a', mode: 'live', degraded: false }),
      stubCaseMetrics({ caseId: 'b', mode: 'unavailable', degraded: true }),
      stubCaseMetrics({ caseId: 'c', mode: 'error', degraded: true }),
      stubCaseMetrics({ caseId: 'd', mode: 'empty', degraded: true }),
    ];

    const result = aggregateMetrics(results);

    expect(result.modeBreakdown.live).toBe(1);
    expect(result.modeBreakdown.unavailable).toBe(1);
    expect(result.modeBreakdown.error).toBe(1);
    expect(result.modeBreakdown.empty).toBe(1);
    expect(result.degradedCount).toBe(3);
  });

  it('returns zero breakdown for empty results', () => {
    const result = aggregateMetrics([]);

    expect(result.modeBreakdown.live).toBe(0);
    expect(result.modeBreakdown.unavailable).toBe(0);
    expect(result.modeBreakdown.error).toBe(0);
    expect(result.modeBreakdown.empty).toBe(0);
  });
});
