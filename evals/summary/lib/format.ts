/**
 * Report formatting for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module formats summary evaluation reports for terminal output
 * and CI logging.
 */

import type {
  SummaryEvalReport,
  SummaryEvalCaseResult,
} from '../../packages/contracts/src/domain/evals/report.js';
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
  lines.push(`Total cases: ${report.summary.totalCases}`);
  lines.push(`Passed: ${report.summary.passedCases}`);
  lines.push(`Failed: ${report.summary.failedCases}`);
  lines.push(`Pass rate: ${(report.summary.passRate * 100).toFixed(1)}%`);
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
  const status = report.summary.passed ? 'PASS' : 'FAIL';
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
  if (result.judgeResult.requiredFactsCovered.length === 0 && result.judgeResult.requiredFactsMissing.length === 0) {
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
