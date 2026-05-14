/**
 * Unified Evaluation Runner - All Endpoints
 *
 * Phase 28-01: EOPS-01, EOPS-02
 *
 * Combines retrieval and summary evaluation into a single runner with:
 * - Unified CLI entry points (eval:smoke, eval:core, eval:all)
 * - Combined terminal output with slice comparison
 * - Single JSON report with both evaluation types
 *
 * Usage:
 *   pnpm exec tsx evals/scripts/eval-all.ts --tier smoke
 *   pnpm exec tsx evals/scripts/eval-all.ts --tier core --json --json-path ./reports/eval-report.json
 *   pnpm exec tsx evals/scripts/eval-all.ts --dry-run --allow-empty
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface EvalAllOptions {
  tier: 'smoke' | 'core';
  json: boolean;
  jsonPath?: string;
  verbose: boolean;
  dryRun: boolean;
  allowEmpty: boolean;
}

function parseArgs_(): EvalAllOptions {
  const { values } = parseArgs({
    options: {
      tier: {
        type: 'string',
        short: 't',
        default: 'smoke',
      },
      json: {
        type: 'boolean',
        short: 'j',
        default: false,
      },
      'json-path': {
        type: 'string',
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
      'dry-run': {
        type: 'boolean',
        short: 'd',
        default: false,
      },
      'allow-empty': {
        type: 'boolean',
        short: 'e',
        default: false,
      },
    },
    strict: true,
  });

  const tier = values.tier as 'smoke' | 'core';
  if (tier !== 'smoke' && tier !== 'core') {
    console.error(`Invalid tier: ${tier}. Must be 'smoke' or 'core'.`);
    process.exit(1);
  }

  return {
    tier,
    json: values.json,
    jsonPath: values['json-path'],
    verbose: values.verbose,
    dryRun: values['dry-run'],
    allowEmpty: values['allow-empty'],
  };
}

// =============================================================================
// Combined Report Types
// =============================================================================

interface RetrievalResult {
  passed: boolean;
  report: unknown;
  durationMs: number;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    slices: Array<{
      tier: string;
      endpoint: string;
      mode?: string;
      caseCount: number;
      avgHitAt1: number;
      avgMrr: number;
      avgNdcg: number;
      passRate: number;
    }>;
  };
}

interface SummaryResult {
  passed: boolean;
  report: unknown;
  durationMs: number;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    avgGroundedness: number;
    avgCoverage: number;
    forbiddenClaimHits: number;
  };
}

interface CombinedReport {
  schemaVersion: 1;
  timestamp: string;
  durationMs: number;
  tier: 'smoke' | 'core';
  retrieval: RetrievalResult | null;
  summary: SummaryResult | null;
  overall: {
    passed: boolean;
    totalCases: number;
    passedCases: number;
    failedCases: number;
  };
}

// =============================================================================
// Evaluation Execution Functions
// =============================================================================

/**
 * Run retrieval evaluation and return results.
 */
async function runRetrievalEval(options: EvalAllOptions): Promise<RetrievalResult | null> {
  const startTime = Date.now();

  try {
    // Dynamic import of the retrieval runner
    const { runRetrievalEvaluation } = await import('../retrieval/lib/runner-api.js');

    const result = await runRetrievalEvaluation({
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: options.allowEmpty,
      verbose: options.verbose ? 1 : 0,
    });

    return {
      passed: result.passed,
      report: result.report,
      durationMs: Date.now() - startTime,
      summary: {
        totalCases: result.summary.totalCases,
        passedCases: result.summary.passedCases,
        failedCases: result.summary.failedCases,
        passRate: result.summary.passRate,
        slices: result.slices.map((s: any) => ({
          tier: s.slice.tier,
          endpoint: s.slice.endpoint,
          mode: s.slice.mode,
          caseCount: s.caseCount,
          avgHitAt1: s.avgHitAt1,
          avgMrr: s.avgMrr,
          avgNdcg: s.avgNdcg,
          passRate: s.passRate,
        })),
      },
    };
  } catch (error) {
    // If the runner API doesn't exist yet, fall back to dry-run simulation
    if (options.dryRun) {
      console.log('  Retrieval evaluation: dry-run mode (runner-api not available)');
      return null;
    }

    console.error('Retrieval evaluation failed:', error);
    throw error;
  }
}

/**
 * Run summary evaluation and return results.
 */
async function runSummaryEval(options: EvalAllOptions): Promise<SummaryResult | null> {
  const startTime = Date.now();

  try {
    // Dynamic import of the summary runner
    const { runSummaryEvaluation } = await import('../summary/lib/runner-api.js');

    const result = await runSummaryEvaluation({
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: options.allowEmpty,
      verbose: options.verbose ? 1 : 0,
    });

    return {
      passed: result.passed,
      report: result.report,
      durationMs: Date.now() - startTime,
      summary: {
        totalCases: result.summary.totalCases,
        passedCases: result.summary.passedCases,
        failedCases: result.summary.failedCases,
        passRate: result.summary.passRate,
        avgGroundedness: result.summary.avgGroundedness,
        avgCoverage: result.summary.avgCoverage,
        forbiddenClaimHits: result.summary.forbiddenClaimHits,
      },
    };
  } catch (error) {
    // If the runner API doesn't exist yet, fall back to dry-run simulation
    if (options.dryRun) {
      console.log('  Summary evaluation: dry-run mode (runner-api not available)');
      return null;
    }

    console.error('Summary evaluation failed:', error);
    throw error;
  }
}

// =============================================================================
// Combined Report Formatting
// =============================================================================

/**
 * Format the combined report for terminal output.
 */
function formatCombinedReport(report: CombinedReport, _options: EvalAllOptions): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║               Unified Evaluation Report                      ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push(`Tier: ${report.tier}`);
  lines.push('');

  // Retrieval Evaluation Section
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                    Retrieval Evaluation');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (report.retrieval) {
    const ret = report.retrieval;
    lines.push('');
    lines.push(`Total cases: ${ret.summary.totalCases}`);
    lines.push(`Passed: ${ret.summary.passedCases}`);
    lines.push(`Failed: ${ret.summary.failedCases}`);
    lines.push(`Pass rate: ${(ret.summary.passRate * 100).toFixed(1)}%`);
    lines.push(`Duration: ${ret.durationMs}ms`);
    lines.push('');

    // Slice comparison table
    if (ret.summary.slices.length > 0) {
      lines.push('=== Slice Comparison ===');
      lines.push('');
      lines.push(
        'Tier     | Endpoint              | Mode          | Cases | Pass Rate | Avg Hit@1 | Avg MRR | Avg nDCG',
      );
      lines.push(
        '---------|----------------------|---------------|-------|-----------|-----------|---------|----------',
      );

      for (const slice of ret.summary.slices) {
        const mode = slice.mode || 'default';
        const tier = slice.tier.padEnd(8);
        const endpoint = slice.endpoint.padEnd(20);
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

      // Best/worst summary
      const sortedByPassRate = [...ret.summary.slices].sort((a, b) => b.passRate - a.passRate);
      if (sortedByPassRate.length > 0) {
        const best = sortedByPassRate[0];
        const worst = sortedByPassRate[sortedByPassRate.length - 1];
        lines.push('=== Comparison Summary ===');
        lines.push(
          `Best performing slice:  ${best.endpoint} (${best.mode || 'default'}) - ${(best.passRate * 100).toFixed(1)}% pass rate`,
        );
        lines.push(
          `Worst performing slice: ${worst.endpoint} (${worst.mode || 'default'}) - ${(worst.passRate * 100).toFixed(1)}% pass rate`,
        );
        lines.push('');
      }
    }
  } else {
    lines.push('');
    lines.push('(No retrieval evaluation data - dry-run or skipped)');
    lines.push('');
  }

  // Summary Evaluation Section
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                     Summary Evaluation');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (report.summary) {
    const sum = report.summary;
    lines.push('');
    lines.push(`Total cases: ${sum.summary.totalCases}`);
    lines.push(`Passed: ${sum.summary.passedCases}`);
    lines.push(`Failed: ${sum.summary.failedCases}`);
    lines.push(`Pass rate: ${(sum.summary.passRate * 100).toFixed(1)}%`);
    lines.push(`Duration: ${sum.durationMs}ms`);
    lines.push('');
    lines.push('=== Quality Metrics ===');
    lines.push(`Average Groundedness: ${sum.summary.avgGroundedness.toFixed(2)}`);
    lines.push(`Average Coverage: ${sum.summary.avgCoverage.toFixed(2)}`);
    lines.push(`Forbidden Claim Hits: ${sum.summary.forbiddenClaimHits}`);
    lines.push('');
  } else {
    lines.push('');
    lines.push('(No summary evaluation data - dry-run or skipped)');
    lines.push('');
  }

  // Overall Status
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                      Overall Status');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`Total cases: ${report.overall.totalCases}`);
  lines.push(`Passed: ${report.overall.passedCases}`);
  lines.push(`Failed: ${report.overall.failedCases}`);
  lines.push('');

  if (report.overall.passed) {
    lines.push('✓ All evaluations passed.');
  } else {
    lines.push('✗ Some evaluations failed.');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Write combined JSON report to file.
 */
function writeCombinedJsonReport(path: string, report: CombinedReport): void {
  const dir = path.replace(/\/[^/]+$/, '');
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // Directory might already exist
  }
  writeFileSync(path, JSON.stringify(report, null, 2));
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs_();

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              Unified Evaluation Runner                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Tier: ${options.tier}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Allow empty: ${options.allowEmpty}`);
  console.log(`JSON output: ${options.json}`);
  if (options.jsonPath) {
    console.log(`JSON path: ${options.jsonPath}`);
  }
  console.log('');

  // Run evaluations
  console.log('Running evaluations...\n');

  let retrievalResult: RetrievalResult | null = null;
  let summaryResult: SummaryResult | null = null;

  // Run retrieval evaluation
  console.log('--- Retrieval Evaluation ---');
  try {
    retrievalResult = await runRetrievalEval(options);
    if (retrievalResult) {
      console.log(
        `  Completed: ${retrievalResult.summary.passedCases}/${retrievalResult.summary.totalCases} passed`,
      );
    }
  } catch (error) {
    console.error('  Failed:', error);
    if (!options.allowEmpty && !options.dryRun) {
      process.exit(1);
    }
  }
  console.log('');

  // Run summary evaluation
  console.log('--- Summary Evaluation ---');
  try {
    summaryResult = await runSummaryEval(options);
    if (summaryResult) {
      console.log(
        `  Completed: ${summaryResult.summary.passedCases}/${summaryResult.summary.totalCases} passed`,
      );
    }
  } catch (error) {
    console.error('  Failed:', error);
    if (!options.allowEmpty && !options.dryRun) {
      process.exit(1);
    }
  }
  console.log('');

  // Build combined report
  const totalCases =
    (retrievalResult?.summary.totalCases ?? 0) + (summaryResult?.summary.totalCases ?? 0);
  const passedCases =
    (retrievalResult?.summary.passedCases ?? 0) + (summaryResult?.summary.passedCases ?? 0);
  const failedCases = totalCases - passedCases;

  const combinedReport: CombinedReport = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    tier: options.tier,
    retrieval: retrievalResult,
    summary: summaryResult,
    overall: {
      passed: failedCases === 0 && (retrievalResult !== null || summaryResult !== null),
      totalCases,
      passedCases,
      failedCases,
    },
  };

  // Print terminal output
  console.log(formatCombinedReport(combinedReport, options));

  // Write JSON if requested
  if (options.json && options.jsonPath) {
    writeCombinedJsonReport(options.jsonPath, combinedReport);
    console.log(`JSON report written to: ${options.jsonPath}\n`);
  }

  // Exit with error code if any failures
  if (!combinedReport.overall.passed && !options.dryRun) {
    console.log(`Evaluation completed with ${failedCases} failure(s).\n`);
    process.exit(1);
  }

  console.log('Evaluation completed successfully.\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
