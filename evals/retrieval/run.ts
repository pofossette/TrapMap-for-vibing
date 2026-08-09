/**
 * Retrieval Evaluation Runner Entry Point
 *
 * Phase 25-01: Thin entrypoint that loads and validates datasets.
 * Phase 26-01: Real execution substrate with adapters, normalization, metrics, and governance.
 *
 * Usage:
 *   pnpm eval:retrieval --tier smoke
 *   pnpm eval:retrieval --tier core --dry-run --allow-empty
 *   pnpm eval:retrieval --tier smoke --endpoint /v2/retrieval/search
 *   pnpm eval:retrieval --tier core --json --json-path ./reports/retrieval.json
 */

import { parseArgs } from 'node:util';

import {
  type RetrievalEvalCase,
  type RetrievalEvalTier,
  retrievalEvalCaseSchema,
} from '@trapmap/contracts/evals';

import { coreCases } from './core.js';
// Import tier datasets
import { smokeCases } from './smoke.js';

// Import execution modules
import { executeRetrievalCase } from './lib/execute-case.js';
import {
  aggregateSliceMetrics,
  buildRunnerSummary,
  formatRunnerSummary,
} from './lib/runner-summary.js';
import type { CaseResult, RunnerSummary } from './lib/types.js';

interface RunOptions {
  tier: RetrievalEvalTier;
  dryRun: boolean;
  allowEmpty: boolean;
  endpoint?: '/v1/retrieval/search' | '/v2/retrieval/search' | '/v3/retrieval/search';
  json: boolean;
  jsonPath?: string;
  verbose: number;
  /** Path to baseline report for comparison (Phase 29-03) */
  baselinePath?: string;
  /** Write current results as new baseline (Phase 29-03) */
  writeBaseline?: boolean;
  runner: 'native' | 'promptfoo';
}

/**
 * Parse command-line arguments for the evaluation runner.
 * Phase 29-03: EOPS-03 (baseline options)
 */
function parseArgs_(): RunOptions {
  const { values } = parseArgs({
    options: {
      tier: {
        type: 'string',
        short: 't',
        default: 'smoke',
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
      endpoint: {
        type: 'string',
        short: 'p',
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
      baseline: {
        type: 'string',
        description: 'Path to baseline report for comparison',
      },
      'write-baseline': {
        type: 'boolean',
        default: false,
        description: 'Write current results as new baseline',
      },
      runner: {
        type: 'string',
        default: 'native',
      },
    },
    strict: true,
  });

  const tier = values.tier as RetrievalEvalTier;
  if (tier !== 'smoke' && tier !== 'core') {
    console.error(`Invalid tier: ${tier}. Must be 'smoke' or 'core'.`);
    process.exit(1);
  }

  const endpoint = values.endpoint as
    | '/v1/retrieval/search'
    | '/v2/retrieval/search'
    | '/v3/retrieval/search'
    | undefined;
  if (
    endpoint &&
    endpoint !== '/v1/retrieval/search' &&
    endpoint !== '/v2/retrieval/search' &&
    endpoint !== '/v3/retrieval/search'
  ) {
    console.error(
      `Invalid endpoint: ${endpoint}. Must be '/v1/retrieval/search', '/v2/retrieval/search', or '/v3/retrieval/search'.`,
    );
    process.exit(1);
  }

  const runnerValue = values.runner ?? 'native';
  if (runnerValue !== 'native' && runnerValue !== 'promptfoo') {
    console.error(`Invalid --runner value: ${runnerValue}`);
    process.exit(1);
  }
  const runner = runnerValue as 'native' | 'promptfoo';

  return {
    tier,
    dryRun: values['dry-run'],
    allowEmpty: values['allow-empty'],
    json: values.json,
    verbose: values.verbose ? 1 : 0,
    runner,
    ...(endpoint !== undefined ? { endpoint } : {}),
    ...(values['json-path'] !== undefined ? { jsonPath: values['json-path'] } : {}),
    ...(values.baseline !== undefined ? { baselinePath: values.baseline } : {}),
    ...(values['write-baseline'] ? { writeBaseline: true } : {}),
  };
}

/**
 * Load cases for the specified tier.
 */
function loadCases(tier: RetrievalEvalTier): RetrievalEvalCase[] {
  const rawCases = tier === 'smoke' ? smokeCases : coreCases;

  // Validate each case against the schema
  const validatedCases: RetrievalEvalCase[] = [];
  for (const rawCase of rawCases) {
    try {
      const parsed = retrievalEvalCaseSchema.parse(rawCase);
      validatedCases.push(parsed);
    } catch (error) {
      console.error(`Invalid case in ${tier} tier:`, error);
      throw error;
    }
  }

  return validatedCases;
}

/**
 * Filter cases by endpoint if specified.
 */
function filterByEndpoint(
  cases_: RetrievalEvalCase[],
  endpoint?: '/v1/retrieval/search' | '/v2/retrieval/search' | '/v3/retrieval/search',
): RetrievalEvalCase[] {
  if (!endpoint) return cases_;
  return cases_.filter((c) => c.endpoint === endpoint);
}

// =============================================================================
// Execution and Reporting
// =============================================================================

/**
 * Execute all cases and return results.
 */
async function executeAllCases(cases_: RetrievalEvalCase[]): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  // Each case gets an isolated context to prevent fixture bleeding
  for (const case_ of cases_) {
    results.push(await executeRetrievalCase(case_));
  }

  return results;
}

/**
 * Print the JSON report body.
 */
async function writeJsonSummary(
  summary: RunnerSummary,
  jsonPath: string | undefined,
): Promise<void> {
  if (jsonPath) {
    const fs = await import('node:fs/promises');
    const dir = jsonPath.replace(/\/[^/]+$/, '');
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2));
    console.log(`JSON report written to: ${jsonPath}\n`);
  } else {
    console.log('\n=== JSON Report ===');
    console.log(JSON.stringify(summary, null, 2));
  }
}

/**
 * Main entry point for the retrieval evaluation runner.
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs_();

  console.log('\n=== Retrieval Evaluation Runner ===');
  console.log(`Tier: ${options.tier}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Allow empty: ${options.allowEmpty}`);
  if (options.endpoint) {
    console.log(`Endpoint filter: ${options.endpoint}`);
  }
  console.log('');

  // Load and validate cases
  let cases_: RetrievalEvalCase[];
  try {
    cases_ = loadCases(options.tier);
  } catch (error) {
    console.error('Failed to load cases:', error);
    process.exit(1);
  }

  // Filter by endpoint if specified
  cases_ = filterByEndpoint(cases_, options.endpoint);

  // Check for empty dataset
  if (cases_.length === 0) {
    if (options.allowEmpty) {
      console.log('No cases found. Exiting successfully (allow-empty mode).\n');
      return;
    }
    console.error(`No cases found for tier '${options.tier}'. Use --allow-empty to skip.`);
    process.exit(1);
  }

  // Summary output
  console.log(`Loaded ${cases_.length} case(s):`);
  for (const c of cases_) {
    console.log(`  - [${c.endpoint}] ${c.caseId} (${c.expected.outcome})`);
  }
  console.log('');

  if (options.dryRun) {
    console.log('Dry run complete. No evaluation executed.\n');
    return;
  }

  if (options.runner === 'promptfoo') {
    console.log('Executing evaluation...\n');
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { retrievalBridge } = await import('./bridge.js');
    const { report } = await runSuiteWithPromptfoo(retrievalBridge, {
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: options.allowEmpty,
      runner: 'promptfoo',
      verbose: options.verbose,
      ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
    });

    console.log(formatRunnerSummary(report.caseResults, report.sliceMetrics));
    if (options.json) await writeJsonSummary(report, options.jsonPath);

    if (report.caseResults.some((r) => !r.passed)) {
      console.log('Evaluation completed with failures.\n');
      process.exit(1);
    }

    console.log('Evaluation completed successfully.\n');
    return;
  }

  // Execute cases
  console.log('Executing evaluation...\n');
  const results = await executeAllCases(cases_);
  const slices = aggregateSliceMetrics(results);

  // Print summary
  console.log(formatRunnerSummary(results, slices));

  // Phase 29-03: Baseline write/compare flow
  if (options.writeBaseline && options.baselinePath) {
    const fs = await import('node:fs/promises');
    const baselineDir = options.baselinePath.replace(/\/[^/]+$/, '');
    await fs.mkdir(baselineDir, { recursive: true }).catch(() => {});

    const baselineReport = {
      timestamp: new Date().toISOString(),
      tier: options.tier,
      slices: slices.map((s) => ({
        slice: s.slice,
        avgHitAt1: s.avgHitAt1,
        avgHitAt5: s.avgHitAt5,
        avgHitAt10: s.avgHitAt10,
        avgMrr: s.avgMrr,
        avgNdcg: s.avgNdcg,
        avgRecallAt10: s.avgRecallAt10,
        selectedMode: s.selectedMode,
        fallbackApplied: s.fallbackApplied,
      })),
      governanceFailures: results
        .filter((r) => !r.governance.passed)
        .map((r) => ({
          caseId: r.case.caseId,
          failures: r.governance.failures,
        })),
    };

    await fs.writeFile(options.baselinePath, JSON.stringify(baselineReport, null, 2));
    console.log(`Baseline written to: ${options.baselinePath}\n`);
  }

  // Phase 29-03: Baseline comparison
  if (options.baselinePath && !options.writeBaseline) {
    const fs = await import('node:fs/promises');
    try {
      const baselineContent = await fs.readFile(options.baselinePath, 'utf-8');
      const baseline = JSON.parse(baselineContent);

      console.log('\n=== Baseline Comparison ===');
      console.log(`Baseline from: ${baseline.timestamp}`);

      // Compare slices
      for (const currentSlice of slices) {
        const key = `${currentSlice.slice.tier}:${currentSlice.slice.endpoint}:${currentSlice.slice.mode ?? 'none'}`;
        const baselineSlice = baseline.slices?.find(
          (s: { slice: { tier: string; endpoint: string; mode?: string } }) =>
            `${s.slice.tier}:${s.slice.endpoint}:${s.slice.mode ?? 'none'}` === key,
        );

        if (baselineSlice) {
          const hitAt1Diff = currentSlice.avgHitAt1 - baselineSlice.avgHitAt1;
          const mrrDiff = currentSlice.avgMrr - baselineSlice.avgMrr;

          if (hitAt1Diff < -0.05 || mrrDiff < -0.05) {
            console.log(
              `  REGRESSED: ${key} - Hit@1: ${currentSlice.avgHitAt1.toFixed(3)} (${hitAt1Diff >= 0 ? '+' : ''}${hitAt1Diff.toFixed(3)}), MRR: ${currentSlice.avgMrr.toFixed(3)} (${mrrDiff >= 0 ? '+' : ''}${mrrDiff.toFixed(3)})`,
            );
          } else if (hitAt1Diff > 0.05 || mrrDiff > 0.05) {
            console.log(
              `  IMPROVED: ${key} - Hit@1: ${currentSlice.avgHitAt1.toFixed(3)} (${hitAt1Diff >= 0 ? '+' : ''}${hitAt1Diff.toFixed(3)}), MRR: ${currentSlice.avgMrr.toFixed(3)} (${mrrDiff >= 0 ? '+' : ''}${mrrDiff.toFixed(3)})`,
            );
          } else {
            console.log(
              `  STABLE: ${key} - Hit@1: ${currentSlice.avgHitAt1.toFixed(3)}, MRR: ${currentSlice.avgMrr.toFixed(3)}`,
            );
          }
        } else {
          console.log(`  NO-BASELINE: ${key}`);
        }
      }
      console.log('');
    } catch {
      console.error(`Warning: Could not read baseline from ${options.baselinePath}`);
    }
  }

  // Write JSON report if requested
  if (options.json) {
    const summary = buildRunnerSummary(results, toRunnerOptions(options), Date.now() - startTime);
    await writeJsonSummary(summary, options.jsonPath);
  }

  // Exit with error code if any failures
  const hasFailures = results.some((r) => !r.passed);
  if (hasFailures) {
    console.log('Evaluation completed with failures.\n');
    process.exit(1);
  }

  console.log('Evaluation completed successfully.\n');
}

function toRunnerOptions(options: RunOptions): RunnerSummary['options'] {
  return {
    tier: options.tier,
    json: options.json,
    allowEmpty: options.allowEmpty,
    dryRun: options.dryRun,
    verbose: options.verbose,
    ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
    ...(options.jsonPath !== undefined ? { jsonPath: options.jsonPath } : {}),
    ...(options.baselinePath !== undefined ? { baselinePath: options.baselinePath } : {}),
    ...(options.writeBaseline ? { writeBaseline: true } : {}),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
