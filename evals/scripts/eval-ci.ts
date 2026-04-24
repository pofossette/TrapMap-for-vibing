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

import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  BaselineReport,
  RegressionThresholds,
  RegressionResult,
  RetrievalEvalReport,
} from '../../packages/contracts/src/domain/evals/report.js';
import {
  TIER_THRESHOLDS,
  baselineReportSchema,
  regressionResultSchema,
} from '../../packages/contracts/src/domain/evals/report.js';

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
// Baseline Path Helpers (Phase 31-03: EOPS-03)
// =============================================================================

const BASELINES_DIR = 'reports/baselines';

/**
 * Get the baseline file path for a tier.
 */
function getBaselinePath(tier: 'smoke' | 'core'): string {
  return resolve(process.cwd(), BASELINES_DIR, `baseline-${tier}.json`);
}

/**
 * Ensure baselines directory exists.
 */
function ensureBaselinesDir(): void {
  const dir = resolve(process.cwd(), BASELINES_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if baseline is available for a tier.
 */
function isBaselineAvailable(tier: 'smoke' | 'core'): boolean {
  return existsSync(getBaselinePath(tier));
}

/**
 * Load baseline for a tier.
 */
function loadBaseline(tier: 'smoke' | 'core'): BaselineReport | null {
  const path = getBaselinePath(tier);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    return baselineReportSchema.parse(JSON.parse(content));
  } catch (error) {
    console.error(`Failed to load baseline: ${error}`);
    return null;
  }
}

// =============================================================================
// Regression Comparison (Phase 31-03: EOPS-03)
// =============================================================================

/**
 * Compare current report against baseline.
 */
function compareWithBaseline(
  report: RetrievalEvalReport,
  baseline: BaselineReport,
  thresholds: RegressionThresholds,
): RegressionResult {
  const regressedSlices: RegressionResult['regressedSlices'] = [];
  const improvedSlices: RegressionResult['improvedSlices'] = [];
  const regressedCohorts: RegressionResult['regressedCohorts'] = [];

  // Compare slices
  for (const currentSlice of report.slices) {
    const key = `${currentSlice.slice.tier}:${currentSlice.slice.endpoint}:${currentSlice.slice.mode ?? 'none'}`;
    const baselineSlice = baseline.slices.find(s =>
      `${s.slice.tier}:${s.slice.endpoint}:${s.slice.mode ?? 'none'}` === key
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
      } else if (hitAt1Delta > Math.abs(thresholds.hitAt1Threshold) ||
                 mrrDelta > Math.abs(thresholds.mrrThreshold)) {
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

  // Compare cohorts
  if (report.cohorts && baseline.cohorts) {
    for (const currentCohort of report.cohorts) {
      const key = `${currentCohort.cohort.queryType}:${currentCohort.cohort.routeFamily}`;
      const baselineCohort = baseline.cohorts.find(c =>
        `${c.cohort.queryType}:${c.cohort.routeFamily}` === key
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

  // Compare governance
  const governanceRegressions = Math.max(
    0,
    report.failures.filter(f => f.kind === 'forbidden-hit').length -
    baseline.governanceFailures.length
  );

  const hasRegressions = regressedSlices.length > 0 ||
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

/**
 * Write current results as new baseline.
 */
function writeBaseline(
  report: RetrievalEvalReport,
  tier: 'smoke' | 'core',
  durationMs: number,
): void {
  ensureBaselinesDir();

  const baseline: BaselineReport = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    tier,
    commitSha: process.env.GITHUB_SHA?.substring(0, 7),
    branch: process.env.GITHUB_REF_NAME,
    slices: report.slices.map(s => ({
      slice: s.slice,
      routeFamily: s.routeFamily,
      avgHitAt1: s.avgHitAt1,
      avgHitAt5: s.avgHitAt5,
      avgHitAt10: s.avgHitAt10,
      avgMrr: s.avgMrr,
      avgNdcg: s.avgNdcg,
      avgRecallAt10: s.avgRecallAt10,
      selectedMode: s.selectedMode,
      fallbackApplied: s.fallbackApplied,
      passRate: s.passRate,
    })),
    cohorts: report.cohorts?.map(c => ({
      cohort: c.cohort,
      avgHitAt1: c.avgHitAt1,
      avgMrr: c.avgMrr,
      passRate: c.passRate,
      governanceFailureCount: c.governanceFailureCount,
    })),
    governanceFailures: report.failures
      .filter(f => f.kind === 'forbidden-hit')
      .map(f => ({
        caseId: f.caseId,
        endpoint: f.endpoint,
        tier: f.tier,
        failureKinds: [f.kind],
      })),
    totalCases: report.summary.totalCases,
    passedCases: report.summary.passedCases,
    passRate: report.summary.passRate,
    durationMs,
  };

  const path = getBaselinePath(tier);
  writeFileSync(path, JSON.stringify(baseline, null, 2), 'utf-8');
  console.log(`Baseline written to: ${path}`);
}

/**
 * Format regression result for CI output.
 */
function formatRegressionResult(regression: RegressionResult): string {
  const lines: string[] = [];

  if (!regression.baselineAvailable) {
    lines.push('No baseline available for comparison.');
    return lines.join('\n');
  }

  lines.push(`Baseline timestamp: ${regression.baselineTimestamp}`);
  lines.push('');

  if (regression.regressedSlices.length > 0) {
    lines.push('=== REGRESSED SLICES ===');
    for (const s of regression.regressedSlices) {
      const mode = s.slice.mode ?? 'default';
      lines.push(`  ${s.slice.endpoint} (${mode}):`);
      lines.push(`    Hit@1: ${s.baselineHitAt1.toFixed(3)} -> ${s.currentHitAt1.toFixed(3)} (${s.hitAt1Delta >= 0 ? '+' : ''}${s.hitAt1Delta.toFixed(3)})`);
      lines.push(`    MRR:   ${s.baselineMrr.toFixed(3)} -> ${s.currentMrr.toFixed(3)} (${s.mrrDelta >= 0 ? '+' : ''}${s.mrrDelta.toFixed(3)})`);
    }
    lines.push('');
  }

  if (regression.improvedSlices.length > 0) {
    lines.push('=== IMPROVED SLICES ===');
    for (const s of regression.improvedSlices) {
      const mode = s.slice.mode ?? 'default';
      lines.push(`  ${s.slice.endpoint} (${mode}):`);
      lines.push(`    Hit@1: ${s.baselineHitAt1.toFixed(3)} -> ${s.currentHitAt1.toFixed(3)} (+${s.hitAt1Delta.toFixed(3)})`);
    }
    lines.push('');
  }

  if (regression.governanceRegressions > 0) {
    lines.push(`Governance regressions: +${regression.governanceRegressions}`);
    lines.push('');
  }

  lines.push(`Summary: ${regression.regressedSlices.length} regressed, ${regression.improvedSlices.length} improved`);

  return lines.join('\n');
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
  /** Regression analysis (Phase 31-03: EOPS-03) */
  regression?: RegressionResult;
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

  // Load baseline for comparison (Phase 31-03: EOPS-03)
  const baseline = loadBaseline(tier);
  let regression: RegressionResult | undefined;

  if (baseline && retrievalResult?.report) {
    console.log('Comparing against baseline...');
    const thresholds = TIER_THRESHOLDS[tier];
    regression = compareWithBaseline(
      retrievalResult.report as RetrievalEvalReport,
      baseline,
      thresholds
    );

    // Set regression outputs
    setGitHubOutput('has_regressions', regression.hasRegressions ? 'true' : 'false');
    setGitHubOutput('regressed_count', regression.regressedSlices.length);
    setGitHubOutput('improved_count', regression.improvedSlices.length);
    setGitHubOutput('baseline_timestamp', regression.baselineTimestamp ?? '');
    setGitHubOutput('baseline_status', 'available');

    startGroup('Regression Analysis');
    console.log(formatRegressionResult(regression));
    endGroup();
  } else {
    console.log('No baseline available for comparison.');
    setGitHubOutput('has_regressions', 'false');
    setGitHubOutput('baseline_status', 'no-baseline');
  }

  // Write baseline if WRITE_BASELINE is set (Phase 31-03: EOPS-03)
  if (process.env.WRITE_BASELINE === 'true' && retrievalResult?.report) {
    console.log('Writing baseline...');
    writeBaseline(
      retrievalResult.report as RetrievalEvalReport,
      tier,
      report.durationMs
    );
  }

  // Update report with regression data
  report.regression = regression;

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
