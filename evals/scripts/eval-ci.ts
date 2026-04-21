/**
 * CI-Specific Evaluation Runner
 *
 * Phase 28-02: EOPS-01, EOPS-02
 *
 * CI-optimized entry point that:
 * - Writes JSON report to reports/eval-report.json
 * - Sets GitHub Actions output variables for pass/fail status
 * - Outputs CI-friendly compact summary
 * - Always writes report, even on failure
 * - Exits with code 1 on any failure
 *
 * Environment Variables:
 * - TIER: 'smoke' or 'core' (default: 'smoke')
 * - GITHUB_OUTPUT: Path to GitHub Actions output file
 *
 * Usage:
 *   pnpm exec tsx evals/scripts/eval-ci.ts
 *   TIER=core pnpm exec tsx evals/scripts/eval-ci.ts
 */

import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

// =============================================================================
// GitHub Actions Output Helpers
// =============================================================================

/**
 * Set a GitHub Actions output variable.
 * Uses GITHUB_OUTPUT env var if available (actions/runner v2+).
 */
function setGitHubOutput(name: string, value: string | number): void {
  const githubOutput = process.env.GITHUB_OUTPUT;

  if (githubOutput) {
    // New format: name=value (append to file)
    const line = `${name}=${value}\n`;
    appendFileSync(githubOutput, line, 'utf8');
  } else {
    // Legacy format or local run: print to stdout
    console.log(`::set-output name=${name}::${value}`);
  }
}

/**
 * Output a GitHub Actions group start.
 */
function startGroup(name: string): void {
  console.log(`::group::${name}`);
}

/**
 * Output a GitHub Actions group end.
 */
function endGroup(): void {
  console.log('::endgroup::');
}

// =============================================================================
// Report Types (simplified for CI)
// =============================================================================

interface CIReportSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  passed: boolean;
}

interface CIReport {
  schemaVersion: 1;
  timestamp: string;
  durationMs: number;
  tier: 'smoke' | 'core';
  retrieval: {
    passed: boolean;
    summary: CIReportSummary;
    report: unknown;
  } | null;
  summary: {
    passed: boolean;
    summary: CIReportSummary & {
      avgGroundedness: number;
      avgCoverage: number;
      forbiddenClaimHits: number;
    };
    report: unknown;
  } | null;
  overall: {
    passed: boolean;
    totalCases: number;
    passedCases: number;
    failedCases: number;
  };
}

// =============================================================================
// Evaluation Execution
// =============================================================================

/**
 * Run retrieval evaluation and return CI-friendly result.
 */
async function runRetrievalEval(tier: 'smoke' | 'core'): Promise<CIReport['retrieval']> {
  const startTime = Date.now();

  try {
    const { runRetrievalEvaluation } = await import('../retrieval/lib/runner-api.js');

    const result = await runRetrievalEvaluation({
      tier,
      dryRun: false,
      allowEmpty: false,
      verbose: 0,
    });

    return {
      passed: result.passed,
      summary: {
        totalCases: result.summary.totalCases,
        passedCases: result.summary.passedCases,
        failedCases: result.summary.failedCases,
        passRate: result.summary.passRate,
        passed: result.passed,
      },
      report: result.report,
    };
  } catch (error) {
    console.error('Retrieval evaluation error:', error);
    return null;
  }
}

/**
 * Run summary evaluation and return CI-friendly result.
 */
async function runSummaryEval(tier: 'smoke' | 'core'): Promise<CIReport['summary']> {
  const startTime = Date.now();

  try {
    const { runSummaryEvaluation } = await import('../summary/lib/runner-api.js');

    const result = await runSummaryEvaluation({
      tier,
      dryRun: false,
      allowEmpty: false,
      verbose: 0,
    });

    return {
      passed: result.passed,
      summary: {
        totalCases: result.summary.totalCases,
        passedCases: result.summary.passedCases,
        failedCases: result.summary.failedCases,
        passRate: result.summary.passRate,
        passed: result.passed,
        avgGroundedness: result.summary.avgGroundedness,
        avgCoverage: result.summary.avgCoverage,
        forbiddenClaimHits: result.summary.forbiddenClaimHits,
      },
      report: result.report,
    };
  } catch (error) {
    console.error('Summary evaluation error:', error);
    return null;
  }
}

// =============================================================================
// Report Writing
// =============================================================================

/**
 * Write the CI report to reports/eval-report.json.
 */
function writeCIReport(report: CIReport): void {
  const reportPath = resolve(process.cwd(), 'reports', 'eval-report.json');
  const reportDir = resolve(process.cwd(), 'reports');

  // Ensure reports directory exists
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }

  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Report written to: ${reportPath}`);
}

// =============================================================================
// Compact Summary Formatting
// =============================================================================

/**
 * Format a compact one-line summary for CI logs.
 */
function formatCompactSummary(report: CIReport): string {
  const status = report.overall.passed ? 'PASS' : 'FAIL';

  let details = '';

  if (report.retrieval) {
    const ret = report.retrieval.summary;
    details += `Retrieval: ${ret.passedCases}/${ret.totalCases}`;
  }

  if (report.summary) {
    const sum = report.summary.summary;
    if (details) details += ' | ';
    details += `Summary: ${sum.passedCases}/${sum.totalCases} (G=${sum.avgGroundedness.toFixed(2)} C=${sum.avgCoverage.toFixed(2)})`;
  }

  return `[${status}] ${report.overall.passedCases}/${report.overall.totalCases} cases passed | ${details}`;
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  // Parse tier from environment
  const tier = (process.env.TIER as 'smoke' | 'core') ?? 'smoke';
  if (tier !== 'smoke' && tier !== 'core') {
    console.error(`Invalid TIER: ${tier}. Must be 'smoke' or 'core'.`);
    process.exit(1);
  }

  console.log('');
  console.log('=== CI Evaluation Runner ===');
  console.log(`Tier: ${tier}`);
  console.log(`GitHub Output: ${process.env.GITHUB_OUTPUT ?? 'not set'}`);
  console.log('');

  // Run evaluations
  let retrievalResult: CIReport['retrieval'] = null;
  let summaryResult: CIReport['summary'] = null;

  // Retrieval evaluation
  console.log('Running retrieval evaluation...');
  try {
    retrievalResult = await runRetrievalEval(tier);
    if (retrievalResult) {
      console.log(`  Completed: ${retrievalResult.summary.passedCases}/${retrievalResult.summary.totalCases} passed`);
    } else {
      console.log('  Skipped or unavailable');
    }
  } catch (error) {
    console.error('  Failed:', error);
  }

  // Summary evaluation
  console.log('Running summary evaluation...');
  try {
    summaryResult = await runSummaryEval(tier);
    if (summaryResult) {
      console.log(`  Completed: ${summaryResult.summary.passedCases}/${summaryResult.summary.totalCases} passed`);
    } else {
      console.log('  Skipped or unavailable');
    }
  } catch (error) {
    console.error('  Failed:', error);
  }

  // Build combined report
  const totalCases = (retrievalResult?.summary.totalCases ?? 0) + (summaryResult?.summary.totalCases ?? 0);
  const passedCases = (retrievalResult?.summary.passedCases ?? 0) + (summaryResult?.summary.passedCases ?? 0);
  const failedCases = totalCases - passedCases;

  const report: CIReport = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    tier,
    retrieval: retrievalResult,
    summary: summaryResult,
    overall: {
      passed: failedCases === 0 && (retrievalResult !== null || summaryResult !== null),
      totalCases,
      passedCases,
      failedCases,
    },
  };

  // Write report (always, even on failure)
  writeCIReport(report);

  // Set GitHub Actions outputs
  setGitHubOutput('passed', report.overall.passed ? 'true' : 'false');
  setGitHubOutput('total_cases', report.overall.totalCases);
  setGitHubOutput('passed_cases', report.overall.passedCases);
  setGitHubOutput('failed_cases', report.overall.failedCases);

  // Output compact summary in a group
  console.log('');
  startGroup('Evaluation Results');
  console.log(formatCompactSummary(report));
  endGroup();
  console.log('');

  // Exit with appropriate code
  if (!report.overall.passed) {
    console.log(`Evaluation FAILED: ${failedCases} of ${totalCases} cases did not pass.`);
    process.exit(1);
  }

  console.log(`Evaluation PASSED: All ${totalCases} cases passed.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
