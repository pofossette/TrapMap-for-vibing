/**
 * Summary evaluation report builder.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module builds canonical summary evaluation reports from case results.
 * The report structure is validated through Zod schemas for type safety.
 */

import type {
  SummaryEvalCaseResult,
  SummaryEvalFailureRecord,
  SummaryEvalReport,
  SummaryEvalReportMeta,
} from '../../../packages/contracts/src/domain/evals/report.js';
import { summaryEvalReportSchema } from '../../../packages/contracts/src/domain/evals/report.js';
import type { JudgeProvider, RunnerOptions, SummaryCaseResult } from './types.js';

// =============================================================================
// Report Builder
// =============================================================================

/**
 * Build a canonical summary evaluation report from case results.
 *
 * @param params - Case results, options, duration, and provider
 * @returns Validated summary evaluation report
 */
export function buildSummaryReport(params: {
  caseResults: SummaryCaseResult[];
  options: RunnerOptions;
  durationMs: number;
  llmProvider: JudgeProvider;
}): SummaryEvalReport {
  const { caseResults, options, durationMs, llmProvider } = params;

  // Build metadata
  const meta: SummaryEvalReportMeta = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    durationMs,
    llmProvider,
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

  // Calculate averages
  const avgGroundedness = average(caseResults.map((r) => r.judgeResult.groundednessScore));
  const avgCoverage = average(caseResults.map((r) => r.judgeResult.coverageScore));
  const forbiddenClaimHits = caseResults.reduce(
    (sum, r) => sum + r.judgeResult.forbiddenClaimsFound.length,
    0,
  );

  // Build case summaries
  const cases = caseResults.map(buildCaseSummary).sort((a, b) => a.caseId.localeCompare(b.caseId));

  // Build failure records
  const failures = caseResults.flatMap(buildFailureRecords).sort((a, b) => {
    const caseCompare = a.caseId.localeCompare(b.caseId);
    if (caseCompare !== 0) return caseCompare;
    return a.kind.localeCompare(b.kind);
  });

  const report: SummaryEvalReport = {
    meta,
    summary: {
      totalCases,
      passedCases,
      failedCases,
      passRate,
      passed: failedCases === 0,
      avgGroundedness,
      avgCoverage,
      forbiddenClaimHits,
    },
    cases,
    failures,
  };

  // Validate through schema
  return summaryEvalReportSchema.parse(report);
}

// =============================================================================
// Case Summary Builder
// =============================================================================

/**
 * Build a case summary from a case result.
 *
 * @param result - Case result
 * @returns Case summary for report
 */
function buildCaseSummary(result: SummaryCaseResult): SummaryEvalCaseResult {
  const claimsTotal = result.judgeResult.claims.length;
  const claimsSupported = result.judgeResult.claims.filter((c) => c.supported).length;

  return {
    caseId: result.case.caseId,
    endpoint: result.case.endpoint,
    tier: result.case.tier,
    passed: result.passed,
    groundednessScore: result.judgeResult.groundednessScore,
    coverageScore: result.judgeResult.coverageScore,
    claimsTotal,
    claimsSupported,
    requiredFactsCovered: result.judgeResult.requiredFactsCovered,
    requiredFactsMissing: result.judgeResult.requiredFactsMissing,
    forbiddenClaimsFound: result.judgeResult.forbiddenClaimsFound,
    durationMs: result.durationMs,
  };
}

// =============================================================================
// Failure Record Builder
// =============================================================================

/**
 * Build failure records from a case result.
 *
 * @param result - Case result
 * @returns Array of failure records
 */
function buildFailureRecords(result: SummaryCaseResult): SummaryEvalFailureRecord[] {
  const failures: SummaryEvalFailureRecord[] = [];
  const caseId = result.case.caseId;

  // Groundedness failure
  if (result.judgeResult.groundednessScore < (result.case.expected.minGroundedness ?? 0.8)) {
    failures.push({
      caseId,
      kind: 'groundedness-below-threshold',
      description: `Groundedness score ${result.judgeResult.groundednessScore.toFixed(2)} below minimum ${(result.case.expected.minGroundedness ?? 0.8).toFixed(2)}`,
    });
  }

  // Coverage failure
  if (result.judgeResult.coverageScore < (result.case.expected.minCoverage ?? 0.7)) {
    failures.push({
      caseId,
      kind: 'coverage-below-threshold',
      description: `Coverage score ${result.judgeResult.coverageScore.toFixed(2)} below minimum ${(result.case.expected.minCoverage ?? 0.7).toFixed(2)}`,
    });
  }

  // Forbidden claims failures
  for (const forbidden of result.judgeResult.forbiddenClaimsFound) {
    failures.push({
      caseId,
      kind: 'forbidden-claim-found',
      description: `Forbidden claim found: "${forbidden}"`,
    });
  }

  return failures;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate average of an array of numbers.
 *
 * @param values - Array of numbers
 * @returns Average value, or 0 if empty
 */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// =============================================================================
// Report Summary Formatter
// =============================================================================

/**
 * Format a compact one-line summary for CI logs.
 *
 * @param report - Summary evaluation report
 * @returns Compact one-line summary
 */
export function summarizeReport(report: SummaryEvalReport): string {
  const status = report.summary.passed ? 'PASS' : 'FAIL';
  const metrics = `G=${report.summary.avgGroundedness.toFixed(2)} C=${report.summary.avgCoverage.toFixed(2)}`;

  return `[${status}] Summary Eval: ${report.summary.passedCases}/${report.summary.totalCases} passed | ${metrics} | Forbidden: ${report.summary.forbiddenClaimHits}`;
}
