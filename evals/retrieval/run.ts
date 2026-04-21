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
  retrievalEvalCaseSchema,
  type RetrievalEvalCase,
  type RetrievalEvalTier,
} from '../../packages/contracts/src/index.js';

// Import tier datasets
import { smokeCases } from './smoke.js';
import { coreCases } from './core.js';

// Import execution modules
import {
  createExecutionContext,
  closeExecutionContext,
  executeCase,
} from './lib/adapters.js';
import { loadCases, filterByEndpoint } from './lib/load.js';
import { evaluateGovernance } from './lib/governance.js';
import { calculateMetrics, averageMetrics } from './lib/metrics.js';
import type {
  RunnerOptions,
  CaseResult,
  SliceMetrics,
  RunnerSummary,
  SliceKey,
} from './lib/types.js';

interface RunOptions {
  tier: RetrievalEvalTier;
  dryRun: boolean;
  allowEmpty: boolean;
  endpoint?: '/v1/retrieval/search' | '/v2/retrieval/search';
  json: boolean;
  jsonPath?: string;
  verbose: number;
}

/**
 * Parse command-line arguments for the evaluation runner.
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
    | undefined;
  if (endpoint && endpoint !== '/v1/retrieval/search' && endpoint !== '/v2/retrieval/search') {
    console.error(`Invalid endpoint: ${endpoint}. Must be '/v1/retrieval/search' or '/v2/retrieval/search'.`);
    process.exit(1);
  }

  return {
    tier,
    dryRun: values['dry-run'],
    allowEmpty: values['allow-empty'],
    endpoint,
    json: values.json,
    jsonPath: values['json-path'],
    verbose: values.verbose ? 1 : 0,
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
  endpoint?: '/v1/retrieval/search' | '/v2/retrieval/search',
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
async function executeAllCases(
  cases_: RetrievalEvalCase[],
): Promise<CaseResult[]> {
  const ctx = await createExecutionContext();
  const results: CaseResult[] = [];

  try {
    for (const case_ of cases_) {
      const adapterResult = await executeCase(ctx, case_);

      // Evaluate governance
      const governance = evaluateGovernance(case_, adapterResult.result);

      // Calculate metrics
      const metrics = calculateMetrics(
        adapterResult.result,
        case_.expected.relevance.relevantIds,
        case_.expected.relevance.idealOrder,
      );

      // Determine overall pass
      const outcomeMatch =
        (case_.expected.outcome === 'empty' && adapterResult.result.isEmpty) ||
        (case_.expected.outcome === 'non-empty' && !adapterResult.result.isEmpty);
      const passed = governance.passed && outcomeMatch;

      results.push({
        case: case_,
        result: adapterResult.result,
        execution: adapterResult.execution,
        governance,
        metrics,
        passed,
        warnings: adapterResult.warnings,
      });
    }
  } finally {
    await closeExecutionContext(ctx);
  }

  return results;
}

/**
 * Aggregate metrics by slice.
 */
function aggregateSliceMetrics(
  results: CaseResult[],
): SliceMetrics[] {
  // Group by slice key
  const sliceMap = new Map<string, CaseResult[]>();

  for (const result of results) {
    const key: SliceKey = {
      tier: result.case.tier,
      endpoint: result.case.endpoint,
      mode: result.case.request.mode,
    };
    const keyStr = `${key.tier}:${key.endpoint}:${key.mode ?? 'none'}`;

    const existing = sliceMap.get(keyStr) ?? [];
    existing.push(result);
    sliceMap.set(keyStr, existing);
  }

  // Aggregate each slice
  const slices: SliceMetrics[] = [];

  for (const [keyStr, sliceResults] of sliceMap) {
    const [tier, endpoint, mode] = keyStr.split(':');
    const metrics = averageMetrics(sliceResults.map((r) => r.metrics));
    const governanceFailures = sliceResults.filter((r) => !r.governance.passed).length;

    slices.push({
      slice: {
        tier: tier as RetrievalEvalTier,
        endpoint: endpoint as '/v1/retrieval/search' | '/v2/retrieval/search',
        mode: mode === 'none' ? undefined : mode as 'semantic' | 'hybrid' | 'graph-assisted',
      },
      caseCount: sliceResults.length,
      avgHitAt1: metrics.hitAt1,
      avgHitAt5: metrics.hitAt5,
      avgHitAt10: metrics.hitAt10,
      avgMrr: metrics.mrr,
      avgNdcg: metrics.ndcg,
      avgRecallAt10: metrics.recallAt10,
      governanceFailures,
    });
  }

  return slices;
}

/**
 * Print human-readable summary.
 */
function printSummary(results: CaseResult[], slices: SliceMetrics[]): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? passed / results.length : 0;

  console.log('\n=== Evaluation Summary ===');
  console.log(`Total cases: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Pass rate: ${(passRate * 100).toFixed(1)}%`);
  console.log('');

  // Print slice metrics
  console.log('=== Slice Metrics ===');
  for (const slice of slices) {
    const modeStr = slice.slice.mode ? ` (${slice.slice.mode})` : '';
    console.log(`\n[${slice.slice.tier}] ${slice.slice.endpoint}${modeStr}`);
    console.log(`  Cases: ${slice.caseCount}`);
    console.log(`  Avg Hit@1: ${slice.avgHitAt1.toFixed(2)}`);
    console.log(`  Avg Hit@5: ${slice.avgHitAt5.toFixed(2)}`);
    console.log(`  Avg Hit@10: ${slice.avgHitAt10.toFixed(2)}`);
    console.log(`  Avg MRR: ${slice.avgMrr.toFixed(2)}`);
    console.log(`  Avg nDCG: ${slice.avgNdcg.toFixed(2)}`);
    console.log(`  Avg Recall@10: ${slice.avgRecallAt10.toFixed(2)}`);
    console.log(`  Governance failures: ${slice.governanceFailures}`);
  }

  // Print governance failures
  const govFailures = results.filter((r) => !r.governance.passed);
  if (govFailures.length > 0) {
    console.log('\n=== Governance Failures ===');
    for (const result of govFailures) {
      console.log(`\n${result.case.caseId}:`);
      for (const failure of result.governance.failures) {
        console.log(`  - [${failure.kind}] ${failure.description}`);
      }
    }
  }

  console.log('');
}

/**
 * Main entry point for the retrieval evaluation runner.
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs_();

  console.log(`\n=== Retrieval Evaluation Runner ===`);
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

  // Execute cases
  console.log('Executing evaluation...\n');
  const results = await executeAllCases(cases_);
  const slices = aggregateSliceMetrics(results);

  // Print summary
  printSummary(results, slices);

  // Write JSON report if requested
  if (options.json) {
    const summary: RunnerSummary = {
      options: {
        tier: options.tier,
        endpoint: options.endpoint,
        json: options.json,
        jsonPath: options.jsonPath,
        allowEmpty: options.allowEmpty,
        dryRun: options.dryRun,
        verbose: options.verbose,
      },
      caseResults: results,
      sliceMetrics: slices,
      totalCases: results.length,
      passedCases: results.filter((r) => r.passed).length,
      failedCases: results.filter((r) => !r.passed).length,
      passRate: results.length > 0 ? results.filter((r) => r.passed).length / results.length : 0,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };

    if (options.jsonPath) {
      const fs = await import('node:fs/promises');
      await fs.mkdir(new URL(options.jsonPath, import.meta.url).pathname.replace(/\/[^/]+$/, ''), { recursive: true }).catch(() => {});
      await fs.writeFile(options.jsonPath, JSON.stringify(summary, null, 2));
      console.log(`JSON report written to: ${options.jsonPath}\n`);
    } else {
      console.log('\n=== JSON Report ===');
      console.log(JSON.stringify(summary, null, 2));
    }
  }

  // Exit with error code if any failures
  const hasFailures = results.some((r) => !r.passed);
  if (hasFailures) {
    console.log('Evaluation completed with failures.\n');
    process.exit(1);
  }

  console.log('Evaluation completed successfully.\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});