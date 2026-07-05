/**
 * Human-readable terminal formatting for retrieval evaluation reports.
 *
 * Phase 26-02: REVAL-04
 * Terminal summary for slices, metrics, and governance failures.
 * Derived from the canonical report structure for consistency.
 */

import type {
  CohortSummary,
  ModeComparison,
  RetrievalEvalFailureRecord,
  RetrievalEvalReport,
  RetrievalEvalSliceSummary,
  RetrievalEvalWarningRecord,
  RoutingDistribution,
} from '../../../packages/contracts/src/domain/evals/report.js';

// =============================================================================
// Main Formatter
// =============================================================================

/**
 * Format a retrieval evaluation report as terminal output.
 * Shows per-slice metrics, case failures, and adapter warnings.
 *
 * @param report - The canonical retrieval evaluation report
 * @returns Human-readable terminal output
 */
export function formatReport(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push('=== Evaluation Summary ===');
  lines.push(`Total cases: ${report.summary.totalCases}`);
  lines.push(`Passed: ${report.summary.passedCases}`);
  lines.push(`Failed: ${report.summary.failedCases}`);
  lines.push(`Pass rate: ${(report.summary.passRate * 100).toFixed(1)}%`);
  lines.push(`Duration: ${report.meta.durationMs}ms`);
  lines.push('');

  // Slice metrics
  if (report.slices.length > 0) {
    lines.push('=== Slice Metrics ===');
    for (const slice of report.slices) {
      lines.push('');
      lines.push(formatSliceSummary(slice));
    }
  }

  // Governance failures
  const govFailures = report.failures.filter(
    (f) =>
      f.kind === 'forbidden-hit' || f.kind === 'shape-mismatch' || f.kind === 'graph-plan-mismatch',
  );
  if (govFailures.length > 0) {
    lines.push('');
    lines.push('=== Governance Failures ===');
    for (const failure of govFailures) {
      lines.push(formatFailure(failure));
    }
  }

  // Outcome mismatches
  const outcomeMismatches = report.failures.filter(
    (f) => f.kind === 'unexpected-empty' || f.kind === 'unexpected-non-empty',
  );
  if (outcomeMismatches.length > 0) {
    lines.push('');
    lines.push('=== Outcome Mismatches ===');
    for (const failure of outcomeMismatches) {
      lines.push(formatFailure(failure));
    }
  }

  // Execution issues
  const execIssues = report.failures.filter((f) => f.kind === 'execution-error');
  if (execIssues.length > 0) {
    lines.push('');
    lines.push('=== Execution Issues ===');
    for (const failure of execIssues) {
      lines.push(formatFailure(failure));
    }
  }

  // Warnings
  const degradedWarnings = report.warnings.filter((w) => w.degraded);
  if (degradedWarnings.length > 0) {
    lines.push('');
    lines.push('=== Warnings ===');
    for (const warning of degradedWarnings) {
      lines.push(formatWarning(warning));
    }
  }

  // Summary
  lines.push('');
  if (report.summary.passed) {
    lines.push('Evaluation completed successfully.');
  } else {
    lines.push('Evaluation completed with failures.');
  }
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Slice Formatter
// =============================================================================

/**
 * Format a slice summary for terminal output.
 */
function formatSliceSummary(slice: RetrievalEvalSliceSummary): string {
  const lines: string[] = [];
  const modeStr = slice.slice.mode ? ` (${slice.slice.mode})` : '';

  lines.push(`[${slice.slice.tier}] ${slice.slice.endpoint}${modeStr}`);
  lines.push(
    `  Cases: ${slice.caseCount} (passed: ${slice.passedCount}, failed: ${slice.failedCount})`,
  );
  lines.push(`  Pass rate: ${(slice.passRate * 100).toFixed(1)}%`);
  lines.push(`  Avg Hit@1: ${slice.avgHitAt1.toFixed(3)}`);
  lines.push(`  Avg Hit@5: ${slice.avgHitAt5.toFixed(3)}`);
  lines.push(`  Avg Hit@10: ${slice.avgHitAt10.toFixed(3)}`);
  lines.push(`  Avg MRR: ${slice.avgMrr.toFixed(3)}`);
  lines.push(`  Avg nDCG: ${slice.avgNdcg.toFixed(3)}`);
  lines.push(`  Avg Recall@10: ${slice.avgRecallAt10.toFixed(3)}`);

  // Failure counts
  const failureParts: string[] = [];
  if (slice.governanceFailureCount > 0) {
    failureParts.push(`governance: ${slice.governanceFailureCount}`);
  }
  if (slice.outcomeMismatchCount > 0) {
    failureParts.push(`outcome: ${slice.outcomeMismatchCount}`);
  }
  if (slice.executionIssueCount > 0) {
    failureParts.push(`execution: ${slice.executionIssueCount}`);
  }

  if (failureParts.length > 0) {
    lines.push(`  Failures: ${failureParts.join(', ')}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Failure Formatter
// =============================================================================

/**
 * Format a failure record for terminal output.
 */
function formatFailure(failure: RetrievalEvalFailureRecord): string {
  const lines: string[] = [];

  lines.push(`\n${failure.caseId} [${failure.tier}/${failure.endpoint}]:`);
  lines.push(`  Kind: ${failure.kind}`);
  lines.push(`  Description: ${failure.description}`);

  if (failure.ids.length > 0) {
    lines.push(`  IDs: ${failure.ids.join(', ')}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Warning Formatter
// =============================================================================

/**
 * Format a warning record for terminal output.
 */
function formatWarning(warning: RetrievalEvalWarningRecord): string {
  return `\n${warning.caseId}: [${warning.code}] ${warning.message}`;
}

// =============================================================================
// Compact Format for CI
// =============================================================================

/**
 * Format a compact summary for CI logs.
 * Single-line format suitable for CI log aggregation.
 */
export function formatCompactSummary(report: RetrievalEvalReport): string {
  const status = report.summary.passed ? 'PASS' : 'FAIL';
  const metrics = `H@1=${report.slices[0]?.avgHitAt1.toFixed(2) ?? 'N/A'} MRR=${report.slices[0]?.avgMrr.toFixed(2) ?? 'N/A'}`;

  return `[${status}] ${report.summary.passedCases}/${report.summary.totalCases} cases passed | ${metrics} | ${report.failures.length} failures | ${report.warnings.filter((w) => w.degraded).length} warnings`;
}

// =============================================================================
// Slice Comparison Formatter
// =============================================================================

/**
 * Format a slice comparison table for cross-endpoint/mode analysis.
 *
 * Phase 28-01: EOPS-02
 *
 * Outputs a comparison table showing metrics by slice (endpoint + mode combination)
 * with columns: Tier, Endpoint, Mode, Cases, Pass Rate, Avg Hit@1, Avg MRR, Avg nDCG.
 * Includes a "Comparison Summary" section highlighting best/worst performing slices.
 *
 * @param report - The canonical retrieval evaluation report
 * @returns Human-readable comparison table
 */
export function formatSliceComparison(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  if (report.slices.length === 0) {
    return 'No slices to compare.';
  }

  // Header
  lines.push('');
  lines.push('=== Slice Comparison ===');
  lines.push('');

  // Table header
  lines.push(
    'Tier     | Endpoint              | Mode          | Cases | Pass Rate | Avg Hit@1 | Avg MRR | Avg nDCG',
  );
  lines.push(
    '---------|----------------------|---------------|-------|-----------|-----------|---------|----------',
  );

  // Sort slices for consistent display
  const sortedSlices = [...report.slices].sort((a, b) => {
    // Sort by tier, then endpoint, then mode
    if (a.slice.tier !== b.slice.tier) {
      return a.slice.tier === 'smoke' ? -1 : 1;
    }
    if (a.slice.endpoint !== b.slice.endpoint) {
      return a.slice.endpoint.localeCompare(b.slice.endpoint);
    }
    const modeA = a.slice.mode ?? 'none';
    const modeB = b.slice.mode ?? 'none';
    return modeA.localeCompare(modeB);
  });

  // Table rows
  for (const slice of sortedSlices) {
    const mode = slice.slice.mode ?? 'default';
    const tier = slice.slice.tier.padEnd(8);
    const endpoint = slice.slice.endpoint.padEnd(20);
    const modeStr = mode.padEnd(13);
    const cases = String(slice.caseCount).padStart(5);
    const passRate = `${(slice.passRate * 100).toFixed(1)}%`.padStart(9);
    const hitAt1 = slice.avgHitAt1.toFixed(3).padStart(9);
    const mrr = slice.avgMrr.toFixed(3).padStart(7);
    const ndcg = slice.avgNdcg.toFixed(3).padStart(9);

    lines.push(
      `${tier} | ${endpoint} | ${modeStr} | ${cases} | ${passRate} | ${hitAt1} | ${mrr} | ${ndcg}`,
    );
  }

  lines.push('');

  // Comparison Summary
  lines.push('=== Comparison Summary ===');
  lines.push('');

  // Best and worst by pass rate
  const byPassRate = [...sortedSlices].sort((a, b) => b.passRate - a.passRate);
  const best = byPassRate[0];
  const worst = byPassRate[byPassRate.length - 1];

  if (best && worst) {
    const bestMode = best.slice.mode ?? 'default';
    const worstMode = worst.slice.mode ?? 'default';

    lines.push(
      `Best performing slice:  ${best.slice.endpoint} (${bestMode}) - ${(best.passRate * 100).toFixed(1)}% pass rate`,
    );
    lines.push(
      `Worst performing slice: ${worst.slice.endpoint} (${worstMode}) - ${(worst.passRate * 100).toFixed(1)}% pass rate`,
    );
    lines.push('');
  }

  // Best by metrics
  const byHitAt1 = [...sortedSlices].sort((a, b) => b.avgHitAt1 - a.avgHitAt1);
  const byMrr = [...sortedSlices].sort((a, b) => b.avgMrr - a.avgMrr);
  const byNdcg = [...sortedSlices].sort((a, b) => b.avgNdcg - a.avgNdcg);

  if (byHitAt1[0] && byMrr[0] && byNdcg[0]) {
    const bestHitAt1Mode = byHitAt1[0].slice.mode ?? 'default';
    const bestMrrMode = byMrr[0].slice.mode ?? 'default';
    const bestNdcgMode = byNdcg[0].slice.mode ?? 'default';

    lines.push('Best by metric:');
    lines.push(
      `  Hit@1:  ${byHitAt1[0].slice.endpoint} (${bestHitAt1Mode}) - ${byHitAt1[0].avgHitAt1.toFixed(3)}`,
    );
    lines.push(
      `  MRR:    ${byMrr[0].slice.endpoint} (${bestMrrMode}) - ${byMrr[0].avgMrr.toFixed(3)}`,
    );
    lines.push(
      `  nDCG:   ${byNdcg[0].slice.endpoint} (${bestNdcgMode}) - ${byNdcg[0].avgNdcg.toFixed(3)}`,
    );
    lines.push('');
  }

  // Governance summary
  const governanceFailures = sortedSlices.filter((s) => s.governanceFailureCount > 0);
  if (governanceFailures.length > 0) {
    lines.push('Governance issues detected in:');
    for (const slice of governanceFailures) {
      const mode = slice.slice.mode ?? 'default';
      lines.push(`  ${slice.slice.endpoint} (${mode}): ${slice.governanceFailureCount} failure(s)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Cohort Comparison Formatter (Phase 31-01: EOPS-01)
// =============================================================================

/**
 * Format a cohort comparison table for query-type analysis.
 *
 * Phase 31-01: EOPS-01
 *
 * Outputs a comparison table showing metrics by cohort (query type + route family)
 * with columns: Query Type, Route, Cases, Pass Rate, Avg Hit@1, Avg MRR, Governance.
 *
 * @param report - The canonical retrieval evaluation report
 * @returns Human-readable cohort comparison table
 */
export function formatCohortComparison(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  if (!report.cohorts || report.cohorts.length === 0) {
    return 'No cohort data to compare.';
  }

  lines.push('');
  lines.push('=== Cohort Comparison ===');
  lines.push('');

  // Table header
  lines.push('Query Type        | Route    | Cases | Pass Rate | Avg Hit@1 | Avg MRR | Governance');
  lines.push(
    '------------------|----------|-------|-----------|-----------|---------|------------',
  );

  // Sort cohorts
  const sortedCohorts = [...report.cohorts].sort((a, b) => {
    if (a.cohort.queryType !== b.cohort.queryType) {
      return a.cohort.queryType.localeCompare(b.cohort.queryType);
    }
    return a.cohort.routeFamily.localeCompare(b.cohort.routeFamily);
  });

  // Table rows
  for (const cohort of sortedCohorts) {
    const queryType = cohort.cohort.queryType.padEnd(16);
    const routeFamily = cohort.cohort.routeFamily.padEnd(8);
    const cases = String(cohort.caseCount).padStart(5);
    const passRate = `${(cohort.passRate * 100).toFixed(1)}%`.padStart(9);
    const hitAt1 = cohort.avgHitAt1.toFixed(3).padStart(9);
    const mrr = cohort.avgMrr.toFixed(3).padStart(7);
    const governance = String(cohort.governanceFailureCount).padStart(10);

    lines.push(
      `${queryType} | ${routeFamily} | ${cases} | ${passRate} | ${hitAt1} | ${mrr} | ${governance}`,
    );
  }

  lines.push('');

  // Summary section
  lines.push('=== Cohort Summary ===');
  lines.push('');

  // Group by query type for summary
  const byQueryType = new Map<string, CohortSummary[]>();
  for (const c of sortedCohorts) {
    const existing = byQueryType.get(c.cohort.queryType) ?? [];
    existing.push(c);
    byQueryType.set(c.cohort.queryType, existing);
  }

  for (const [queryType, cohorts] of byQueryType) {
    const totalCases = cohorts.reduce((sum, c) => sum + c.caseCount, 0);
    const totalPassed = cohorts.reduce((sum, c) => sum + c.passedCount, 0);
    const avgPassRate = totalCases > 0 ? (totalPassed / totalCases) * 100 : 0;
    lines.push(`${queryType}: ${totalCases} cases, ${avgPassRate.toFixed(1)}% avg pass rate`);
  }

  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Mode Comparison Formatter (Phase 31-02: EOPS-01)
// =============================================================================

/**
 * Format mode comparison table showing client vs router-selected modes.
 *
 * Phase 31-02: EOPS-01
 *
 * Outputs a comparison table showing how client-requested modes map to
 * router-selected modes with performance metrics.
 *
 * @param report - The canonical retrieval evaluation report
 * @returns Human-readable mode comparison table
 */
export function formatModeComparison(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  if (!report.modeComparisons || report.modeComparisons.length === 0) {
    return 'No mode comparison data available.';
  }

  lines.push('');
  lines.push('=== Mode Comparison ===');
  lines.push('');

  // Table header
  lines.push(
    'Client Mode   | Selected Mode | Routing Reason        | Fallback | Cases | Hit@1  | MRR',
  );
  lines.push(
    '--------------|---------------|----------------------|----------|-------|--------|-------',
  );

  // Table rows
  for (const mc of report.modeComparisons) {
    const clientMode = (mc.clientMode ?? 'auto').padEnd(12);
    const selectedMode = (mc.selectedMode ?? 'none').padEnd(13);
    const routingReason = (mc.routingReason ?? 'none').padEnd(20);
    const fallback = (mc.fallbackApplied ? 'yes' : 'no').padEnd(8);
    const cases = String(mc.caseCount).padStart(5);
    const hitAt1 = mc.avgHitAt1.toFixed(3).padStart(6);
    const mrr = mc.avgMrr.toFixed(3).padStart(5);

    lines.push(
      `${clientMode} | ${selectedMode} | ${routingReason} | ${fallback} | ${cases} | ${hitAt1} | ${mrr}`,
    );
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format routing distribution showing breakdown of routing decisions.
 *
 * Phase 31-02: EOPS-01
 *
 * @param report - The canonical retrieval evaluation report
 * @returns Human-readable routing distribution summary
 */
export function formatRoutingDistribution(report: RetrievalEvalReport): string {
  const lines: string[] = [];

  if (!report.routingDistribution || report.routingDistribution.length === 0) {
    return 'No routing distribution data available.';
  }

  lines.push('');
  lines.push('=== Routing Distribution ===');
  lines.push('');

  // Table header
  lines.push('Routing Reason        | Count | Percentage');
  lines.push('----------------------|-------|------------');

  // Table rows
  for (const rd of report.routingDistribution) {
    const reason = rd.reason.padEnd(20);
    const count = String(rd.count).padStart(5);
    const percentage = `${rd.percentage.toFixed(1)}%`.padStart(10);

    lines.push(`${reason} | ${count} | ${percentage}`);
  }

  lines.push('');

  // Summary
  const totalCases = report.routingDistribution.reduce((sum, rd) => sum + rd.count, 0);
  const fallbackCount =
    report.modeComparisons
      ?.filter((mc) => mc.fallbackApplied)
      .reduce((sum, mc) => sum + mc.caseCount, 0) ?? 0;
  const fallbackPct = totalCases > 0 ? ((fallbackCount / totalCases) * 100).toFixed(1) : '0.0';

  lines.push(`Total cases: ${totalCases}`);
  lines.push(`Fallback applied: ${fallbackCount} (${fallbackPct}%)`);

  lines.push('');

  return lines.join('\n');
}
