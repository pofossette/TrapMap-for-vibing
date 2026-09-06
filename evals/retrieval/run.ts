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
import { loadAndFilterCases, resolveRunnerValue } from '../lib/runner-cli.js';
import type { RetrievalEvalCase, RetrievalEvalTier } from '../types/index.js';
import { loadCases } from './lib/load.js';
// Import execution modules
import { formatRunnerSummary } from './lib/runner-summary.js';
import type { RunnerSummary } from './lib/types.js';

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
        default: 'promptfoo',
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

  const runner = resolveRunnerValue(values.runner);

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
  const cases_ = loadAndFilterCases(loadCases, filterByEndpoint, options);

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

  if (options.baselinePath || options.writeBaseline) {
    console.warn(
      'WARNING: baseline write/compare is native-only; --baseline/--write-baseline are ignored under --runner promptfoo.',
    );
  }
  console.log('Executing evaluation...\n');
  const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
  const { retrievalBridge } = await import('./bridge.js');
  const { report } = await runSuiteWithPromptfoo(retrievalBridge, {
    tier: options.tier,
    dryRun: options.dryRun,
    allowEmpty: options.allowEmpty,
    runner: 'promptfoo',
    verbose: options.verbose,
    json: options.json,
    ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
    ...(options.jsonPath !== undefined ? { jsonPath: options.jsonPath } : {}),
    ...(options.baselinePath !== undefined ? { baselinePath: options.baselinePath } : {}),
    ...(options.writeBaseline ? { writeBaseline: true } : {}),
  });

  console.log(formatRunnerSummary(report.caseResults, report.sliceMetrics));
  if (options.json) await writeJsonSummary(report, options.jsonPath);

  if (report.caseResults.some((r) => !r.passed)) {
    console.log('Evaluation completed with failures.\n');
    process.exit(1);
  }

  console.log('Evaluation completed successfully.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
