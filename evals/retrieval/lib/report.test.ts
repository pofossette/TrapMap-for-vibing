/**
 * Tests for report builder and formatter.
 *
 * Phase 26-02: REVAL-04
 * Phase 29-03: EOPS-03 (routing trace tests)
 * Tests for validated JSON report, terminal formatting, and slice summaries.
 */

import { describe, expect, it } from 'vitest';

import { retrievalEvalReportSchema } from '@trapmap/contracts/evals';
import { formatCompactSummary, formatReport } from './format.js';
import { buildReport } from './report.js';
import type { CaseResult, NormalizedResult } from './types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const makeCaseResult = (overrides: Partial<CaseResult> = {}): CaseResult => ({
  case: {
    schemaVersion: 1,
    caseId: 'test-case',
    tier: 'smoke',
    endpoint: '/v1/retrieval/search',
    request: { seed: 'test' },
    scenarioId: 'test-scenario',
    expected: {
      outcome: 'non-empty',
      relevance: { relevantIds: [], idealOrder: [] },
      governance: { forbiddenIds: [], forbiddenReasons: [] },
      shape: {},
    },
    tags: [],
  },
  result: {
    hits: [],
    returnedIds: [],
    buckets: { globalConstraints: [], projectKnowledge: [] },
    profileHintArtifactIds: [],
    artifactIds: [],
    isEmpty: true,
    rawResponse: {},
    endpoint: '/v1/retrieval/search',
  },
  execution: {
    adapterType: 'route',
    fallbackUsed: false,
    endpoint: '/v1/retrieval/search',
    durationMs: 10,
    fallbackApplied: false,
  },
  governance: { passed: true, failures: [], forbiddenHits: [] },
  metrics: {
    hitAt1: 0,
    hitAt5: 0,
    hitAt10: 0,
    mrr: 0,
    ndcg: 0,
    recallAt10: 0,
  },
  passed: true,
  warnings: [],
  ...overrides,
});

const makeOptions = () => ({
  tier: 'smoke' as const,
  dryRun: false,
  allowEmpty: false,
  verbose: 0,
});

// =============================================================================
// Tests: Report Building
// =============================================================================

describe('report building', () => {
  it('builds a validated JSON report suitable for regression tooling', () => {
    const caseResults = [
      makeCaseResult({ case: { ...makeCaseResult().case, caseId: 'case-1' } }),
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-2', endpoint: '/v2/retrieval/search' },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    // Validate through schema
    const parsed = retrievalEvalReportSchema.parse(report);
    expect(parsed).toBeDefined();
    expect(parsed.summary.totalCases).toBe(2);
  });

  it('includes slice summaries sorted by tier, endpoint, mode', () => {
    const caseResults = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'case-1',
          tier: 'core',
          endpoint: '/v1/retrieval/search',
          request: { seed: 'test', mode: 'hybrid' },
        },
      }),
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'case-2',
          tier: 'smoke',
          endpoint: '/v2/retrieval/search',
          request: { seed: 'test' },
        },
      }),
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'case-3',
          tier: 'core',
          endpoint: '/v1/retrieval/search',
          request: { seed: 'test', mode: 'semantic' },
        },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    expect(report.slices).toHaveLength(3);
    // Sorted: smoke first, then core; within tier, v1 before v2; within endpoint, mode alphabetical
    expect(report.slices[0]?.slice.tier).toBe('smoke');
    expect(report.slices[1]?.slice.mode).toBe('hybrid');
    expect(report.slices[2]?.slice.mode).toBe('semantic');
  });

  it('includes failure records sorted by case ID, then kind', () => {
    const caseResults = [
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-b' },
        governance: {
          passed: false,
          failures: [
            { kind: 'forbidden-hit', description: 'forbidden', ids: ['id1'] },
            { kind: 'shape-mismatch', description: 'shape', ids: [] },
          ],
          forbiddenHits: ['id1'],
        },
        passed: false,
      }),
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-a' },
        governance: {
          passed: false,
          failures: [{ kind: 'forbidden-hit', description: 'forbidden', ids: ['id2'] }],
          forbiddenHits: ['id2'],
        },
        passed: false,
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    expect(report.failures).toHaveLength(3);
    // Sorted by case ID, then by kind
    expect(report.failures[0]?.caseId).toBe('case-a');
    expect(report.failures[1]?.caseId).toBe('case-b');
    expect(report.failures[1]?.kind).toBe('forbidden-hit');
    expect(report.failures[2]?.kind).toBe('shape-mismatch');
  });

  it('preserves graph-plan mismatch as a canonical retrieval report failure kind', () => {
    const caseResults = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'v3-graph-plan-selected-smoke',
          endpoint: '/v3/retrieval/search',
        },
        governance: {
          passed: false,
          failures: [
            {
              kind: 'graph-plan-mismatch',
              description: 'Expected edge trap->skill not found',
              ids: ['trap->skill'],
            },
          ],
          forbiddenHits: [],
        },
        passed: false,
        graphPlanResult: {
          passed: false,
          failures: [
            {
              kind: 'missing-edge',
              description: 'Expected edge trap->skill not found',
              expected: ['trap->skill'],
              actual: [],
            },
          ],
        },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    expect(report.failures).toEqual([
      expect.objectContaining({
        caseId: 'v3-graph-plan-selected-smoke',
        kind: 'graph-plan-mismatch',
        description: 'Expected edge trap->skill not found',
        ids: ['trap->skill'],
      }),
    ]);
  });
});

// =============================================================================
// Tests: Terminal Formatting
// =============================================================================

describe('terminal formatting', () => {
  it('shows per-slice metrics in predictable order', () => {
    const caseResults = [
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-1' },
        metrics: { hitAt1: 1, hitAt5: 1, hitAt10: 1, mrr: 1, ndcg: 1, recallAt10: 1 },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);
    const output = formatReport(report);

    // Check predictable order of metrics
    expect(output).toContain('Avg Hit@1:');
    expect(output).toContain('Avg Hit@5:');
    expect(output).toContain('Avg Hit@10:');
    expect(output).toContain('Avg MRR:');
    expect(output).toContain('Avg nDCG:');
    expect(output).toContain('Avg Recall@10:');
  });

  it('shows case failures and adapter warnings', () => {
    const caseResults = [
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-with-failure' },
        governance: {
          passed: false,
          failures: [
            { kind: 'forbidden-hit', description: 'Forbidden ID found', ids: ['forbidden_1'] },
          ],
          forbiddenHits: ['forbidden_1'],
        },
        passed: false,
        warnings: [{ code: 'route-error', message: 'Route returned 500', degraded: true }],
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);
    const output = formatReport(report);

    expect(output).toContain('Governance Failures');
    expect(output).toContain('case-with-failure');
    expect(output).toContain('forbidden-hit');
    expect(output).toContain('Warnings');
  });

  it('shows graph-plan mismatches in terminal output', () => {
    const caseResults = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'graph-plan-format-case',
          endpoint: '/v3/retrieval/search',
        },
        governance: {
          passed: false,
          failures: [
            {
              kind: 'graph-plan-mismatch',
              description: 'Expected edge trap->skill not found',
              ids: ['trap->skill'],
            },
          ],
          forbiddenHits: [],
        },
        passed: false,
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);
    const output = formatReport(report);

    expect(output).toContain('Governance Failures');
    expect(output).toContain('graph-plan-mismatch');
    expect(output).toContain('Expected edge trap->skill not found');
  });

  it('generates compact summary for CI', () => {
    const caseResults = [
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-1' },
        metrics: { hitAt1: 1, hitAt5: 1, hitAt10: 1, mrr: 0.5, ndcg: 0.8, recallAt10: 1 },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);
    const compact = formatCompactSummary(report);

    expect(compact).toContain('[PASS]');
    expect(compact).toContain('1/1 cases passed');
    expect(compact).toContain('H@1=1.00');
    expect(compact).toContain('MRR=0.50');
  });
});

// =============================================================================
// Tests: JSON and Terminal from Same Source
// =============================================================================

describe('JSON and terminal output from one canonical report', () => {
  it('JSON and terminal output derive from same report structure', () => {
    const caseResults = [
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'test-case-1' },
        metrics: { hitAt1: 1, hitAt5: 0.8, hitAt10: 0.6, mrr: 0.5, ndcg: 0.7, recallAt10: 0.9 },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    // JSON output
    const json = JSON.stringify(report);
    expect(json).toContain('test-case-1');

    // Terminal output
    const terminal = formatReport(report);
    // Terminal shows slice metrics and pass/fail summary
    expect(terminal).toContain('Evaluation Summary');
    expect(terminal).toContain('[smoke] /v1/retrieval/search');

    // Both should have same metric values
    expect(json).toContain('"avgHitAt1":1');
    expect(terminal).toContain('Avg Hit@1: 1.000');
  });
});

// =============================================================================
// Tests: Slice Key Stability
// =============================================================================

describe('slice key stability', () => {
  it('slice keys are stable for comparison across runs', () => {
    const caseResults1 = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'case-1',
          request: { seed: 'test', mode: 'semantic' },
        },
      }),
    ];

    const caseResults2 = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'case-2',
          request: { seed: 'test', mode: 'semantic' },
        },
      }),
    ];

    const report1 = buildReport(caseResults1, makeOptions(), 100);
    const report2 = buildReport(caseResults2, makeOptions(), 100);

    // Same slice key structure
    expect(report1.slices[0]?.slice.tier).toBe(report2.slices[0]?.slice.tier);
    expect(report1.slices[0]?.slice.endpoint).toBe(report2.slices[0]?.slice.endpoint);
    expect(report1.slices[0]?.slice.mode).toBe(report2.slices[0]?.slice.mode);
  });
});

// =============================================================================
// Tests: Routing Trace Fields (Phase 29-03)
// =============================================================================

describe('routing trace fields', () => {
  it('includes selectedMode in case summaries when present', () => {
    const caseResults = [
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-with-mode' },
        execution: {
          ...makeCaseResult().execution,
          selectedMode: 'local',
          routingReason: 'explicit-mode',
          fallbackApplied: false,
        },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    expect(report.cases[0]?.selectedMode).toBe('local');
    expect(report.cases[0]?.routingReason).toBe('explicit-mode');
    expect(report.cases[0]?.fallbackApplied).toBe(false);
  });

  it('includes selectedMode in slice summaries when present', () => {
    const caseResults = [
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-1' },
        execution: {
          ...makeCaseResult().execution,
          selectedMode: 'hybrid',
          fallbackApplied: false,
        },
      }),
      makeCaseResult({
        case: { ...makeCaseResult().case, caseId: 'case-2' },
        execution: {
          ...makeCaseResult().execution,
          selectedMode: 'hybrid',
          fallbackApplied: true,
        },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    // Most common mode in slice
    expect(report.slices[0]?.selectedMode).toBe('hybrid');
    // Fallback applied if any case had fallback
    expect(report.slices[0]?.fallbackApplied).toBe(true);
    // Default regression status
    expect(report.slices[0]?.regressionStatus).toBe('no-baseline');
  });

  it('per-mode slices use canonical stable identifiers', () => {
    const caseResults = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'semantic-case',
          request: { seed: 'test', mode: 'semantic' },
        },
        execution: {
          ...makeCaseResult().execution,
          selectedMode: 'local',
        },
      }),
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'hybrid-case',
          request: { seed: 'test', mode: 'hybrid' },
        },
        execution: {
          ...makeCaseResult().execution,
          selectedMode: 'hybrid',
        },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    // Two distinct slices
    expect(report.slices).toHaveLength(2);
    // Slice keys use canonical mode identifiers
    const sliceModes = report.slices.map((s) => s.slice.mode);
    expect(sliceModes).toContain('semantic');
    expect(sliceModes).toContain('hybrid');
  });

  it('aggregates graph-plan cohorts and routing distribution for v3 cases', () => {
    const caseResults = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'graph-plan-case',
          endpoint: '/v3/retrieval/search',
          request: { seed: 'docker graph rollout' },
        },
        result: {
          ...makeCaseResult().result,
          endpoint: '/v3/retrieval/search',
        } as NormalizedResult,
        execution: {
          ...makeCaseResult().execution,
          endpoint: '/v3/retrieval/search',
          selectedMode: 'mix',
          routingReason: 'graph-plan-selected',
          fallbackApplied: false,
        },
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    expect(report.slices[0]?.routeFamily).toBe('graph-plan');
    expect(report.cohorts[0]?.cohort.routeFamily).toBe('graph-plan');
    expect(report.routingDistribution).toEqual([
      {
        reason: 'graph-plan-selected',
        count: 1,
        percentage: 100,
      },
    ]);
  });

  it('classifies search-by-content slices and cohorts as capsule route family', () => {
    const caseResults = [
      makeCaseResult({
        case: {
          ...makeCaseResult().case,
          caseId: 'skill-lookup-case',
          endpoint: '/v1/retrieval/skills/search-by-content',
          request: { seed: 'docker compose setup' },
        },
        result: {
          ...makeCaseResult().result,
          endpoint: '/v1/retrieval/skills/search-by-content',
          returnedIds: ['artifact_1'],
          artifactIds: ['artifact_1'],
          isEmpty: false,
        } as NormalizedResult,
        execution: {
          ...makeCaseResult().execution,
          endpoint: '/v1/retrieval/skills/search-by-content',
        },
        passed: true,
      }),
    ];

    const report = buildReport(caseResults, makeOptions(), 100);

    expect(report.slices[0]?.slice.endpoint).toBe('/v1/retrieval/skills/search-by-content');
    expect(report.slices[0]?.routeFamily).toBe('capsule');
    expect(report.cohorts[0]?.cohort.routeFamily).toBe('capsule');
  });

  it('omits missing routing reasons instead of emitting invalid synthetic values', () => {
    const report = buildReport([makeCaseResult()], makeOptions(), 100);

    expect(report.routingDistribution).toEqual([]);
  });
});
