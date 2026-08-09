/**
 * Report formatting for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module formats summary evaluation reports for terminal output
 * and CI logging.
 */

import type {
  SummaryEvalCaseResult,
  SummaryEvalReport,
} from '../../../packages/contracts/src/domain/evals/report.js';
import { pushSummaryStats } from '../../lib/eval-report.js';
import type { SummaryCaseResult } from './types.js';

// =============================================================================
// Main Report Formatter
// =============================================================================

/**
 * Format a summary evaluation report for terminal output.
 *
 * @param report - Summary evaluation report
 * @returns Human-readable terminal output
 */
export function formatSummaryReport(report: SummaryEvalReport): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push('=== Summary Evaluation Report ===');
  lines.push(`Timestamp: ${report.meta.timestamp}`);
  lines.push(`Duration: ${report.meta.durationMs}ms`);
  lines.push(`LLM Provider: ${report.meta.llmProvider}`);
  lines.push(`Tier: ${report.meta.options.tier}`);
  lines.push('');

  // Summary stats
  lines.push('=== Summary ===');
  pushSummaryStats(lines, report.summary);
  lines.push(`Average Groundedness: ${report.summary.avgGroundedness.toFixed(2)}`);
  lines.push(`Average Coverage: ${report.summary.avgCoverage.toFixed(2)}`);
  lines.push(`Forbidden Claim Hits: ${report.summary.forbiddenClaimHits}`);
  lines.push('');

  // Per-case breakdown
  if (report.cases.length > 0) {
    lines.push('=== Case Results ===');
    for (const caseResult of report.cases) {
      lines.push(formatCaseResultLine(caseResult));
    }
    lines.push('');
  }

  // Failures
  if (report.failures.length > 0) {
    lines.push('=== Failures ===');
    for (const failure of report.failures) {
      lines.push(`  ${failure.caseId}: [${failure.kind}] ${failure.description}`);
    }
    lines.push('');
  }

  // Final status
  if (report.summary.passed) {
    lines.push('Evaluation completed successfully.');
  } else {
    lines.push('Evaluation completed with failures.');
  }
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Case Result Formatter
// =============================================================================

/**
 * Format a single line for a case result.
 *
 * @param result - Case result
 * @returns Single line summary
 */
function formatCaseResultLine(result: SummaryEvalCaseResult): string {
  const status = result.passed ? '✓' : '✗';
  const groundedness = `G=${result.groundednessScore.toFixed(2)}`;
  const coverage = `C=${result.coverageScore.toFixed(2)}`;
  const claims = `${result.claimsSupported}/${result.claimsTotal} claims`;

  let extra = '';
  if (result.forbiddenClaimsFound.length > 0) {
    extra += ` | ${result.forbiddenClaimsFound.length} forbidden`;
  }
  if (result.requiredFactsMissing.length > 0) {
    extra += ` | ${result.requiredFactsMissing.length} missing facts`;
  }

  return `  ${status} ${result.caseId} [${result.endpoint}]: ${groundedness} ${coverage} ${claims}${extra}`;
}

// =============================================================================
// Compact Formatter for CI
// =============================================================================

/**
 * Format a compact one-line summary for CI logs.
 *
 * @param report - Summary evaluation report
 * @returns Single-line CI-friendly format
 */
export function formatCompactSummary(report: SummaryEvalReport): string {
  const _status = report.summary.passed ? 'PASS' : 'FAIL';
  const groundedness = report.summary.avgGroundedness.toFixed(2);
  const coverage = report.summary.avgCoverage.toFixed(2);

  return `Summary Eval: ${report.summary.passedCases}/${report.summary.totalCases} passed | Groundedness: ${groundedness} | Coverage: ${coverage} | Forbidden: ${report.summary.forbiddenClaimHits}`;
}

// =============================================================================
// Detailed Case Formatter
// =============================================================================

/**
 * Format detailed output for a single case.
 *
 * @param result - Case result with full judge result
 * @returns Multi-line detailed output
 */
export function formatCaseDetail(result: SummaryCaseResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`=== Case: ${result.case.caseId} ===`);
  lines.push(`Endpoint: ${result.case.endpoint}`);
  lines.push(`Tier: ${result.case.tier}`);
  lines.push(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
  lines.push(`Duration: ${result.durationMs}ms`);
  lines.push('');

  // Scores
  lines.push('Scores:');
  lines.push(`  Groundedness: ${result.judgeResult.groundednessScore.toFixed(2)}`);
  lines.push(`  Coverage: ${result.judgeResult.coverageScore.toFixed(2)}`);
  lines.push('');

  // Claims breakdown
  const supported = result.judgeResult.claims.filter((c) => c.supported);
  const unsupported = result.judgeResult.claims.filter((c) => !c.supported);

  lines.push(`Claims (${supported.length}/${result.judgeResult.claims.length} supported):`);

  if (supported.length > 0) {
    lines.push('  Supported:');
    for (const claim of supported) {
      lines.push(`    ✓ ${claim.text}`);
      if (claim.evidence) {
        lines.push(`      Evidence: "${claim.evidence.substring(0, 80)}..."`);
      }
    }
  }

  if (unsupported.length > 0) {
    lines.push('  Unsupported:');
    for (const claim of unsupported) {
      lines.push(`    ✗ ${claim.text}`);
    }
  }
  lines.push('');

  // Required facts coverage
  lines.push('Required Facts:');
  if (result.judgeResult.requiredFactsCovered.length > 0) {
    for (const fact of result.judgeResult.requiredFactsCovered) {
      lines.push(`  ✓ ${fact}`);
    }
  }
  if (result.judgeResult.requiredFactsMissing.length > 0) {
    for (const fact of result.judgeResult.requiredFactsMissing) {
      lines.push(`  ✗ ${fact}`);
    }
  }
  if (
    result.judgeResult.requiredFactsCovered.length === 0 &&
    result.judgeResult.requiredFactsMissing.length === 0
  ) {
    lines.push('  (none required)');
  }
  lines.push('');

  // Forbidden claims
  if (result.judgeResult.forbiddenClaimsFound.length > 0) {
    lines.push('Forbidden Claims Found:');
    for (const claim of result.judgeResult.forbiddenClaimsFound) {
      lines.push(`  ✗ ${claim}`);
    }
    lines.push('');
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  [${warning.code}] ${warning.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// =============================================================================
// Slice Comparison Formatter
// =============================================================================

/**
 * Format a slice comparison table for cross-endpoint analysis.
 *
 * Phase 28-01: EOPS-02
 *
 * Outputs a comparison table showing metrics by endpoint with columns:
 * Endpoint, Cases, Avg Groundedness, Avg Coverage, Forbidden Hits.
 * Includes a "Comparison Summary" section highlighting best/worst performing endpoints.
 *
 * @param report - The canonical summary evaluation report
 * @returns Human-readable comparison table
 */
export function formatSliceComparison(report: SummaryEvalReport): string {
  const lines: string[] = [];

  if (report.cases.length === 0) {
    return 'No cases to compare.';
  }

  // Group cases by endpoint
  const endpointGroups = new Map<string, typeof report.cases>();

  for (const caseResult of report.cases) {
    const existing = endpointGroups.get(caseResult.endpoint) ?? [];
    existing.push(caseResult);
    endpointGroups.set(caseResult.endpoint, existing);
  }

  // Calculate per-endpoint metrics
  const endpointMetrics = Array.from(endpointGroups.entries()).map(([endpoint, cases]) => {
    const passedCases = cases.filter((c) => c.passed).length;
    const avgGroundedness = cases.reduce((sum, c) => sum + c.groundednessScore, 0) / cases.length;
    const avgCoverage = cases.reduce((sum, c) => sum + c.coverageScore, 0) / cases.length;
    const forbiddenHits = cases.reduce((sum, c) => sum + c.forbiddenClaimsFound.length, 0);
    const totalClaims = cases.reduce((sum, c) => sum + c.claimsTotal, 0);
    const supportedClaims = cases.reduce((sum, c) => sum + c.claimsSupported, 0);

    return {
      endpoint,
      cases: cases.length,
      passedCases,
      failedCases: cases.length - passedCases,
      passRate: passedCases / cases.length,
      avgGroundedness,
      avgCoverage,
      forbiddenHits,
      claimsRatio: totalClaims > 0 ? supportedClaims / totalClaims : 0,
    };
  });

  // Sort by pass rate descending
  endpointMetrics.sort((a, b) => b.passRate - a.passRate);

  // Header
  lines.push('');
  lines.push('=== Endpoint Comparison ===');
  lines.push('');

  // Table header
  lines.push(
    'Endpoint              | Cases | Passed | Failed | Pass Rate | Avg Groundedness | Avg Coverage | Forbidden',
  );
  lines.push(
    '----------------------|-------|--------|--------|-----------|------------------|--------------|----------',
  );

  // Table rows
  for (const metric of endpointMetrics) {
    const endpoint = metric.endpoint.padEnd(20);
    const cases = String(metric.cases).padStart(5);
    const passed = String(metric.passedCases).padStart(6);
    const failed = String(metric.failedCases).padStart(6);
    const passRate = `${(metric.passRate * 100).toFixed(1)}%`.padStart(9);
    const groundedness = metric.avgGroundedness.toFixed(2).padStart(16);
    const coverage = metric.avgCoverage.toFixed(2).padStart(12);
    const forbidden = String(metric.forbiddenHits).padStart(8);

    lines.push(
      `${endpoint} | ${cases} | ${passed} | ${failed} | ${passRate} | ${groundedness} | ${coverage} | ${forbidden}`,
    );
  }

  lines.push('');

  // Comparison Summary
  lines.push('=== Comparison Summary ===');
  lines.push('');

  if (endpointMetrics.length > 0) {
    const best = endpointMetrics[0];
    const worst = endpointMetrics[endpointMetrics.length - 1];

    lines.push(
      `Best performing endpoint:  ${best.endpoint} - ${(best.passRate * 100).toFixed(1)}% pass rate`,
    );
    lines.push(
      `Worst performing endpoint: ${worst.endpoint} - ${(worst.passRate * 100).toFixed(1)}% pass rate`,
    );
    lines.push('');
  }

  // Best by metrics
  const byGroundedness = [...endpointMetrics].sort((a, b) => b.avgGroundedness - a.avgGroundedness);
  const byCoverage = [...endpointMetrics].sort((a, b) => b.avgCoverage - a.avgCoverage);

  if (byGroundedness[0] && byCoverage[0]) {
    lines.push('Best by metric:');
    lines.push(
      `  Groundedness: ${byGroundedness[0].endpoint} - ${byGroundedness[0].avgGroundedness.toFixed(2)}`,
    );
    lines.push(
      `  Coverage:     ${byCoverage[0].endpoint} - ${byCoverage[0].avgCoverage.toFixed(2)}`,
    );
    lines.push('');
  }

  // Forbidden claims warning
  const withForbidden = endpointMetrics.filter((m) => m.forbiddenHits > 0);
  if (withForbidden.length > 0) {
    lines.push('⚠️  Forbidden claims detected:');
    for (const metric of withForbidden) {
      lines.push(`  ${metric.endpoint}: ${metric.forbiddenHits} forbidden claim(s)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
