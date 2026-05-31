import { describe, expect, it } from 'vitest';

import type { AggregateMetrics, CaseMetrics } from './run.js';
import {
  aggregateMetrics,
  evaluateCase,
  formatReport,
  performLLMExtraction,
  simulateRuleEngineExtraction,
} from './run.js';

// ---------------------------------------------------------------------------
// Helpers to build minimal CaseMetrics / AggregateMetrics fixtures
// ---------------------------------------------------------------------------

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
    modeBreakdown: { live: 0, fallback: 1 },
    degradedCount: 0,
    warnings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// performLLMExtraction
// ---------------------------------------------------------------------------

describe('performLLMExtraction', () => {
  it('returns mode=fallback and degraded=false in dry-run mode', async () => {
    const result = await performLLMExtraction('some text about docker and timeout', true);

    expect(result.mode).toBe('fallback');
    expect(result.degraded).toBe(false);
    expect(result.warning).toBeNull();
    expect(result.extraction.nodes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// evaluateCase
// ---------------------------------------------------------------------------

describe('evaluateCase', () => {
  it('passes through mode and degraded from extraction result', async () => {
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

    expect(result.mode).toBe('fallback');
    expect(result.degraded).toBe(false);
    expect(result.warning).toBeNull();
    expect(result.caseId).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe('formatReport', () => {
  it('shows DRY-RUN mode label for dry-run reports', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-1', mode: 'fallback', degraded: false }),
    ];
    const agg = stubAggregateMetrics({
      totalCases: 1,
      modeBreakdown: { live: 0, fallback: 1 },
      degradedCount: 0,
      warnings: [],
    });
    const ruleEngineResults: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-1', mode: 'fallback', degraded: false }),
    ];
    const ruleEngineAgg = stubAggregateMetrics({
      totalCases: 1,
      modeBreakdown: { live: 0, fallback: 1 },
    });

    const output = formatReport(results, agg, ruleEngineResults, ruleEngineAgg, true);

    expect(output).toContain('DRY-RUN');
  });

  it('shows degraded warning when degradedCount > 0', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-1', mode: 'fallback', degraded: true }),
    ];
    const agg = stubAggregateMetrics({
      totalCases: 1,
      modeBreakdown: { live: 0, fallback: 1 },
      degradedCount: 1,
      warnings: ['chat-provider-not-configured'],
    });
    const ruleEngineResults: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-1', mode: 'fallback', degraded: false }),
    ];
    const ruleEngineAgg = stubAggregateMetrics();

    const output = formatReport(results, agg, ruleEngineResults, ruleEngineAgg, false);

    expect(output).toContain('DEGRADED');
  });

  it('shows per-case mode indicators', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-live', mode: 'live', degraded: false }),
      stubCaseMetrics({ caseId: 'case-fallback', mode: 'fallback', degraded: false }),
    ];
    const agg = stubAggregateMetrics({
      totalCases: 2,
      modeBreakdown: { live: 1, fallback: 1 },
    });
    const ruleEngineResults: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'case-live', mode: 'fallback', degraded: false }),
      stubCaseMetrics({ caseId: 'case-fallback', mode: 'fallback', degraded: false }),
    ];
    const ruleEngineAgg = stubAggregateMetrics({ totalCases: 2 });

    const output = formatReport(results, agg, ruleEngineResults, ruleEngineAgg, false);

    expect(output).toContain('case-live');
    expect(output).toContain('case-fallback');
  });
});

// ---------------------------------------------------------------------------
// aggregateMetrics
// ---------------------------------------------------------------------------

describe('aggregateMetrics', () => {
  it('computes mode breakdown from case results', () => {
    const results: CaseMetrics[] = [
      stubCaseMetrics({ caseId: 'a', mode: 'live', degraded: false }),
      stubCaseMetrics({ caseId: 'b', mode: 'fallback', degraded: true }),
      stubCaseMetrics({ caseId: 'c', mode: 'live', degraded: false }),
    ];

    const result = aggregateMetrics(results);

    expect(result.modeBreakdown.live).toBe(2);
    expect(result.modeBreakdown.fallback).toBe(1);
    expect(result.degradedCount).toBe(1);
  });

  it('returns zero breakdown for empty results', () => {
    const result = aggregateMetrics([]);

    expect(result.modeBreakdown.live).toBe(0);
    expect(result.modeBreakdown.fallback).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// simulateRuleEngineExtraction
// ---------------------------------------------------------------------------

describe('simulateRuleEngineExtraction', () => {
  it('extracts tool nodes from keyword matches', () => {
    const result = simulateRuleEngineExtraction('docker and postgresql are tools');

    const toolLabels = result.nodes.filter((n) => n.kind === 'tool').map((n) => n.label);

    expect(toolLabels).toContain('docker');
    expect(toolLabels).toContain('postgresql');
  });

  it('extracts cue nodes from pattern matches', () => {
    const result = simulateRuleEngineExtraction('timeout error occurred during startup');

    const cueLabels = result.nodes.filter((n) => n.kind === 'cue').map((n) => n.label);

    expect(cueLabels).toContain('timeout-issue');
    expect(cueLabels).toContain('error-issue');
  });

  it('returns no edges (rule engine does not extract edges)', () => {
    const result = simulateRuleEngineExtraction('docker timeout error during postgresql startup');

    expect(result.edges).toHaveLength(0);
  });

  it('produces deterministic results', () => {
    const input = 'docker timeout error during postgresql startup';
    const first = simulateRuleEngineExtraction(input);
    const second = simulateRuleEngineExtraction(input);

    expect(first).toEqual(second);
  });
});
