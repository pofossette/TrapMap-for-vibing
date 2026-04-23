/**
 * Canonical retrieval evaluation report builder.
 *
 * Phase 26-02: REVAL-04
 * Builds machine-readable and human-readable reports from case results.
 * Both JSON and terminal output are derived from one canonical report structure.
 */

import type {
  RetrievalEvalReport,
  RetrievalEvalReportMeta,
  RetrievalEvalSliceSummary,
  RetrievalEvalCaseSummary,
  RetrievalEvalFailureRecord,
  RetrievalEvalWarningRecord,
  RetrievalEvalSliceKey,
  RetrievalEvalFailureKind,
  ReportBuilderInput,
} from '@trapmap/contracts';
import { retrievalEvalReportSchema } from '@trapmap/contracts';
import type { CaseResult, SliceMetrics, SliceKey } from './types.js';

// =============================================================================
// Report Builder
// =============================================================================

/**
 * Build a canonical retrieval evaluation report from case results.
 * This is the single source of truth for both JSON and terminal output.
 *
 * @param caseResults - Results from executing evaluation cases
 * @param options - Runner options
 * @param durationMs - Total duration of the evaluation run
 * @returns Validated retrieval evaluation report
 */
export function buildReport(
  caseResults: CaseResult[],
  options: ReportBuilderInput['meta']['options'],
  durationMs: number,
): RetrievalEvalReport {
  // Build metadata
  const meta: RetrievalEvalReportMeta = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    durationMs,
    options: {
      tier: options.tier,
      endpoint: options.endpoint,
      dryRun: options.dryRun,
      allowEmpty: options.allowEmpty,
      verbose: options.verbose,
    },
  };

  // Build overall summary
  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((r) => r.passed).length;
  const failedCases = totalCases - passedCases;
  const passRate = totalCases > 0 ? passedCases / totalCases : 0;

  // Build slice summaries (sorted by tier, endpoint, mode)
  const sliceSummaries = buildSliceSummaries(caseResults);
  sliceSummaries.sort(compareSliceSummaries);

  // Build case summaries (sorted by case ID)
  const caseSummaries = caseResults
    .map(buildCaseSummary)
    .sort((a, b) => a.caseId.localeCompare(b.caseId));

  // Build failure records (sorted by case ID, then kind)
  const failureRecords = caseResults
    .flatMap(buildFailureRecords)
    .sort((a, b) => {
      const caseCompare = a.caseId.localeCompare(b.caseId);
      if (caseCompare !== 0) return caseCompare;
      return a.kind.localeCompare(b.kind);
    });

  // Build warning records (sorted by case ID)
  const warningRecords = caseResults
    .flatMap(buildWarningRecords)
    .sort((a, b) => a.caseId.localeCompare(b.caseId));

  const report: RetrievalEvalReport = {
    meta,
    summary: {
      totalCases,
      passedCases,
      failedCases,
      passRate,
      passed: failedCases === 0,
    },
    slices: sliceSummaries,
    cases: caseSummaries,
    failures: failureRecords,
    warnings: warningRecords,
  };

  // Validate through schema
  return retrievalEvalReportSchema.parse(report);
}

// =============================================================================
// Slice Summary Builder
// =============================================================================

/**
 * Build slice summaries from case results.
 */
function buildSliceSummaries(caseResults: CaseResult[]): RetrievalEvalSliceSummary[] {
  // Group by slice key
  const sliceMap = new Map<string, CaseResult[]>();

  for (const result of caseResults) {
    const key = getSliceKeyString({
      tier: result.case.tier,
      endpoint: result.case.endpoint,
      mode: result.case.request.mode,
    });

    const existing = sliceMap.get(key) ?? [];
    existing.push(result);
    sliceMap.set(key, existing);
  }

  // Build summary for each slice
  return Array.from(sliceMap.values()).map(buildSliceSummary);
}

/**
 * Build a single slice summary.
 * Phase 29-03: EOPS-03 (baseline-aware routing trace fields)
 */
function buildSliceSummary(results: CaseResult[]): RetrievalEvalSliceSummary {
  const slice: RetrievalEvalSliceKey = {
    tier: results[0]!.case.tier,
    endpoint: results[0]!.case.endpoint,
    mode: results[0]!.case.request.mode,
  };

  const caseCount = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = caseCount - passedCount;
  const passRate = caseCount > 0 ? passedCount / caseCount : 0;

  // Average metrics
  const avgMetrics = {
    avgHitAt1: average(results.map((r) => r.metrics.hitAt1)),
    avgHitAt5: average(results.map((r) => r.metrics.hitAt5)),
    avgHitAt10: average(results.map((r) => r.metrics.hitAt10)),
    avgMrr: average(results.map((r) => r.metrics.mrr)),
    avgNdcg: average(results.map((r) => r.metrics.ndcg)),
    avgRecallAt10: average(results.map((r) => r.metrics.recallAt10)),
  };

  // Count failures by category
  const governanceFailureCount = results.filter((r) => !r.governance.passed).length;
  // Outcome mismatch: expected non-empty but got empty, or vice versa
  const outcomeMismatchCount = results.filter((r) => {
    const expectedEmpty = r.case.expected.outcome === 'empty';
    const actualEmpty = r.result.isEmpty;
    return expectedEmpty !== actualEmpty;
  }).length;
  // Execution issues: any case with warnings marked as degraded
  const executionIssueCount = results.filter(
    (r) => r.warnings.some((w) => w.degraded),
  ).length;

  // Phase 29-03: Routing trace fields
  // Use the most common selectedMode in the slice
  const modeCounts = new Map<string, number>();
  for (const r of results) {
    if (r.execution.selectedMode) {
      modeCounts.set(r.execution.selectedMode, (modeCounts.get(r.execution.selectedMode) ?? 0) + 1);
    }
  }
  let selectedMode: string | undefined;
  let maxCount = 0;
  for (const [mode, count] of modeCounts) {
    if (count > maxCount) {
      maxCount = count;
      selectedMode = mode;
    }
  }

  // Fallback applied if any case in slice had fallback
  const fallbackApplied = results.some((r) => r.execution.fallbackApplied);

  return {
    slice,
    caseCount,
    passedCount,
    failedCount,
    passRate,
    ...avgMetrics,
    governanceFailureCount,
    outcomeMismatchCount,
    executionIssueCount,
    selectedMode: selectedMode as 'naive' | 'local' | 'global' | 'hybrid' | 'mix' | 'auto' | undefined,
    fallbackApplied,
    regressionStatus: 'no-baseline', // Will be set during baseline comparison
  };
}

// =============================================================================
// Case Summary Builder
// =============================================================================

/**
 * Build a case summary from a case result.
 * Phase 29-03: EOPS-03 (routing trace fields)
 */
function buildCaseSummary(result: CaseResult): RetrievalEvalCaseSummary {
  // Outcome match: expected non-empty and got non-empty, or expected empty and got empty
  const expectedEmpty = result.case.expected.outcome === 'empty';
  const actualEmpty = result.result.isEmpty;
  const outcomeMatch = expectedEmpty === actualEmpty;

  return {
    caseId: result.case.caseId,
    endpoint: result.case.endpoint,
    tier: result.case.tier,
    passed: result.passed,
    outcomeMatch,
    governancePassed: result.governance.passed,
    durationMs: result.execution.durationMs,
    hitAt1: result.metrics.hitAt1,
    hitAt5: result.metrics.hitAt5,
    hitAt10: result.metrics.hitAt10,
    mrr: result.metrics.mrr,
    ndcg: result.metrics.ndcg,
    recallAt10: result.metrics.recallAt10,
    selectedMode: result.execution.selectedMode,
    routingReason: result.execution.routingReason,
    fallbackApplied: result.execution.fallbackApplied,
  };
}

// =============================================================================
// Failure Record Builder
// =============================================================================

/**
 * Build failure records from a case result.
 */
function buildFailureRecords(result: CaseResult): RetrievalEvalFailureRecord[] {
  // Use governance failures directly
  return result.governance.failures.map((f) => ({
    caseId: result.case.caseId,
    kind: mapFailureKind(f.kind),
    description: f.description,
    ids: f.ids,
    endpoint: result.case.endpoint,
    tier: result.case.tier,
  }));
}

/**
 * Map internal failure kind to report failure kind.
 */
function mapFailureKind(kind: string): RetrievalEvalFailureKind {
  const validKinds: RetrievalEvalFailureKind[] = [
    'forbidden-hit',
    'unexpected-empty',
    'unexpected-non-empty',
    'shape-mismatch',
    'execution-error',
  ];

  if (validKinds.includes(kind as RetrievalEvalFailureKind)) {
    return kind as RetrievalEvalFailureKind;
  }

  return 'execution-error';
}

// =============================================================================
// Warning Record Builder
// =============================================================================

/**
 * Build warning records from a case result.
 */
function buildWarningRecords(result: CaseResult): RetrievalEvalWarningRecord[] {
  return result.warnings.map((w) => ({
    caseId: result.case.caseId,
    code: w.code,
    message: w.message,
    degraded: w.degraded,
  }));
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get a stable string key for a slice.
 */
function getSliceKeyString(key: SliceKey): string {
  return `${key.tier}:${key.endpoint}:${key.mode ?? 'none'}`;
}

/**
 * Compare slice summaries for sorting.
 * Sort by tier, then endpoint, then mode.
 */
function compareSliceSummaries(
  a: RetrievalEvalSliceSummary,
  b: RetrievalEvalSliceSummary,
): number {
  // Compare tier
  if (a.slice.tier !== b.slice.tier) {
    return a.slice.tier === 'smoke' ? -1 : 1;
  }

  // Compare endpoint
  if (a.slice.endpoint !== b.slice.endpoint) {
    return a.slice.endpoint.localeCompare(b.slice.endpoint);
  }

  // Compare mode
  const modeA = a.slice.mode ?? 'none';
  const modeB = b.slice.mode ?? 'none';
  return modeA.localeCompare(modeB);
}

/**
 * Calculate average of an array of numbers.
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
