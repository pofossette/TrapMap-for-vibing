/**
 * Graph Extraction Evaluation Runner
 *
 * Evaluates the LLM graph extraction pipeline against annotated ground truth.
 *
 * Metrics:
 * - Node precision/recall/F1 (match by normalized label)
 * - Edge precision/recall/F1 (match by source+target+type)
 * - Strength classification accuracy
 * - Extraction status reporting for unavailable/error/empty cases
 *
 * Usage:
 *   pnpm eval:graph-extraction
 *   pnpm eval:graph-extraction --dry-run
 *   pnpm eval:graph-extraction --smoke
 */

import { parseRunnerCliArgs } from '../lib/runner-cli.js';
import { getSmokeFixtures, graphExtractionFixtures } from './fixtures.js';
import type { AggregateMetrics, CaseMetrics } from './lib/case-eval.js';
import { aggregateMetrics } from './lib/case-eval.js';

// Re-export the case evaluation surface so the runner entrypoint keeps its
// public API (and its tests) without owning the evaluation logic.
export {
  type AggregateMetrics,
  aggregateMetrics,
  type CaseMetrics,
  type ExtractionRunResult,
  evaluateCase,
  performLLMExtraction,
} from './lib/case-eval.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface RunOptions {
  dryRun: boolean;
  smoke: boolean;
  verbose: number;
  runner?: 'native' | 'promptfoo';
}

function parseArgs_(): RunOptions {
  const parsed = parseRunnerCliArgs();
  return {
    dryRun: parsed.dryRun,
    smoke: parsed.smoke,
    verbose: parsed.verbose ? 1 : 0,
    runner: parsed.runner,
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

export function formatReport(
  results: CaseMetrics[],
  agg: AggregateMetrics,
  _unusedComparisonResults: CaseMetrics[],
  _unusedComparisonAgg: AggregateMetrics,
  dryRun: boolean,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('============================================================');
  lines.push('         Graph Extraction Evaluation Report');
  lines.push('============================================================');
  lines.push('');

  // Mode line
  if (dryRun) {
    lines.push('Mode: DRY-RUN (runner validation only, no LLM calls)');
  } else if (agg.modeBreakdown.live === agg.totalCases) {
    lines.push('Mode: LIVE (LLM calls)');
  } else {
    lines.push('Mode: MIXED (some cases unavailable, empty, or failed)');
  }

  lines.push(`Total fixtures: ${agg.totalCases}`);
  lines.push('');

  // Mode breakdown
  if (!dryRun) {
    lines.push(
      `Mode Breakdown: Live: ${agg.modeBreakdown.live}, Unavailable: ${agg.modeBreakdown.unavailable}, Error: ${agg.modeBreakdown.error}, Empty: ${agg.modeBreakdown.empty}`,
    );
    if (agg.degradedCount > 0) {
      lines.push(`DEGRADED: ${agg.degradedCount} case(s) ran without a usable live extraction`);
    }
    lines.push('');
  }

  lines.push('=== Aggregate Metrics (Micro-Averaged) ===');
  lines.push('');
  lines.push('Metric              | Value');
  lines.push('--------------------|--------');
  lines.push(`Node Precision      | ${agg.avgNodePrecision.toFixed(3).padStart(6)}`);
  lines.push(`Node Recall         | ${agg.avgNodeRecall.toFixed(3).padStart(6)}`);
  lines.push(`Node F1             | ${agg.avgNodeF1.toFixed(3).padStart(6)}`);
  lines.push(`Edge Precision      | ${agg.avgEdgePrecision.toFixed(3).padStart(6)}`);
  lines.push(`Edge Recall         | ${agg.avgEdgeRecall.toFixed(3).padStart(6)}`);
  lines.push(`Edge F1             | ${agg.avgEdgeF1.toFixed(3).padStart(6)}`);
  lines.push(`Strength Accuracy   | ${agg.avgStrengthAccuracy.toFixed(3).padStart(6)}`);
  lines.push('');

  // Per-case details
  lines.push('=== Per-Case Results ===');
  lines.push('');
  lines.push('Case ID                    | Mode | Node P/R/F1   | Edge P/R/F1   | Str Acc');
  lines.push('---------------------------|------|---------------|---------------|--------');

  for (const r of results) {
    const caseId = r.caseId.padEnd(25);
    const modeIndicator =
      r.mode === 'live'
        ? ' L '
        : r.mode === 'unavailable'
          ? ' U '
          : r.mode === 'error'
            ? ' E '
            : ' M ';
    const nodePrf =
      `${r.nodeMetrics.precision.toFixed(2)}/${r.nodeMetrics.recall.toFixed(2)}/${r.nodeMetrics.f1.toFixed(2)}`.padStart(
        13,
      );
    const edgePrf =
      `${r.edgeMetrics.precision.toFixed(2)}/${r.edgeMetrics.recall.toFixed(2)}/${r.edgeMetrics.f1.toFixed(2)}`.padStart(
        13,
      );
    const strAcc = r.strengthAccuracy.toFixed(2).padStart(6);
    lines.push(`${caseId} |${modeIndicator}| ${nodePrf} | ${edgePrf} | ${strAcc}`);
  }

  lines.push('');

  // Worst performing cases
  const worstCases = [...results].sort((a, b) => a.nodeMetrics.f1 - b.nodeMetrics.f1).slice(0, 3);
  const worstFirst = worstCases[0];
  if (worstFirst && worstFirst.nodeMetrics.f1 < 1.0) {
    lines.push('=== Lowest F1 Cases ===');
    for (const r of worstCases) {
      if (r.nodeMetrics.f1 >= 1.0) break;
      lines.push(
        `  ${r.caseId}: Node F1=${r.nodeMetrics.f1.toFixed(3)}, Edge F1=${r.edgeMetrics.f1.toFixed(3)}`,
      );
    }
    lines.push('');
  }

  // Warnings
  if (agg.warnings.length > 0) {
    lines.push('=== Warnings ===');
    for (const w of agg.warnings) {
      lines.push(`  - ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs_();

  console.log('');
  console.log('=== Graph Extraction Evaluation ===');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'live'}`);
  console.log(`Smoke: ${options.smoke}`);
  console.log('');

  const fixtureCount = options.smoke ? getSmokeFixtures().length : graphExtractionFixtures.length;
  console.log(`Running ${fixtureCount} fixture(s)...`);
  console.log('');
  const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
  const { graphExtractionBridge } = await import('./bridge.js');
  const { report } = await runSuiteWithPromptfoo(graphExtractionBridge, {
    tier: options.smoke ? 'smoke' : 'core',
    dryRun: options.dryRun,
    allowEmpty: false,
    runner: 'promptfoo',
  });
  console.log(
    formatReport(report.results, report.aggregate, [], aggregateMetrics([]), options.dryRun),
  );
  const durationMs = Date.now() - startTime;
  console.log(`Duration: ${durationMs}ms`);
  console.log('');
  if (!options.dryRun && report.aggregate.degradedCount > 0) {
    console.log(
      `WARNING: ${report.aggregate.degradedCount} case(s) degraded -- results may not reflect true LLM quality`,
    );
  }
  console.log('Evaluation completed successfully.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
