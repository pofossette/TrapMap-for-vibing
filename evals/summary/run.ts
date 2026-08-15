/**
 * Summary Evaluation Runner Entry Point
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 * Phase 30-03: Real endpoint execution with context trace fields
 *
 * Usage:
 *   pnpm eval:summary --tier smoke
 *   pnpm eval:summary --tier core --dry-run --allow-empty
 *   pnpm eval:summary --tier smoke --endpoint /v2/retrieval/search
 *   pnpm eval:summary --tier core --json --json-path ./reports/summary.json
 *   pnpm eval:summary --tier smoke --provider fallback
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type {
  SummaryEvalCase,
  SummaryEvalEndpoint,
  SummaryEvalTier,
} from '@trapmap/contracts/evals';

import { loadAndFilterCases, resolveRunnerValue } from '../lib/runner-cli.js';
import { formatSummaryReport } from './lib/format.js';
// Import evaluation modules
import type { buildSummaryReport } from './lib/report.js';
import { loadCasesForTier } from './lib/runner-api.js';
import type { JudgeProvider } from './lib/types.js';

// =============================================================================
// Command Line Argument Parsing
// =============================================================================

interface RunOptions {
  tier: SummaryEvalTier;
  dryRun: boolean;
  allowEmpty: boolean;
  endpoint?: SummaryEvalEndpoint;
  json: boolean;
  jsonPath?: string;
  verbose: number;
  provider: JudgeProvider;
  runner: 'native' | 'promptfoo';
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
      provider: {
        type: 'string',
        default: 'fallback',
      },
      runner: {
        type: 'string',
        default: 'promptfoo',
      },
    },
    strict: true,
  });

  const tier = values.tier as SummaryEvalTier;
  if (tier !== 'smoke' && tier !== 'core') {
    console.error(`Invalid tier: ${tier}. Must be 'smoke' or 'core'.`);
    process.exit(1);
  }

  const endpoint = values.endpoint as SummaryEvalEndpoint | undefined;
  if (endpoint && endpoint !== '/v1/retrieval/search' && endpoint !== '/v2/retrieval/search') {
    console.error(
      `Invalid endpoint: ${endpoint}. Must be '/v1/retrieval/search' or '/v2/retrieval/search'.`,
    );
    process.exit(1);
  }

  const provider = values.provider as JudgeProvider;
  if (provider !== 'openai' && provider !== 'fallback') {
    console.error(`Invalid provider: ${provider}. Must be 'openai' or 'fallback'.`);
    process.exit(1);
  }

  const runner = resolveRunnerValue(values.runner);

  return {
    tier,
    dryRun: values['dry-run'],
    allowEmpty: values['allow-empty'],
    json: values.json,
    verbose: values.verbose ? 1 : 0,
    provider,
    runner,
    ...(endpoint !== undefined ? { endpoint } : {}),
    ...(values['json-path'] !== undefined ? { jsonPath: values['json-path'] } : {}),
  };
}

// =============================================================================
// Case Loading
// =============================================================================

/**
 * Filter cases by endpoint if specified.
 *
 * @param cases_ - Cases to filter
 * @param endpoint - Optional endpoint filter
 * @returns Filtered cases
 */
function filterByEndpoint(
  cases_: SummaryEvalCase[],
  endpoint?: SummaryEvalEndpoint,
): SummaryEvalCase[] {
  if (!endpoint) return cases_;
  return cases_.filter((c) => c.endpoint === endpoint);
}

// =============================================================================
// Main Entry Point
// =============================================================================

function outputReport(report: ReturnType<typeof buildSummaryReport>, options: RunOptions): void {
  console.log(formatSummaryReport(report));

  // Write JSON if requested
  if (options.json) {
    if (options.jsonPath) {
      const dir = options.jsonPath.replace(/\/[^/]+$/, '');
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // Directory might already exist
      }
      writeFileSync(options.jsonPath, JSON.stringify(report, null, 2));
      console.log(`JSON report written to: ${options.jsonPath}\n`);
    } else {
      console.log('\n=== JSON Report ===');
      console.log(JSON.stringify(report, null, 2));
    }
  }

  // Exit with error code if failures
  if (report.summary.failedCases > 0) {
    console.log(`Evaluation completed with ${report.summary.failedCases} failure(s).\n`);
    process.exit(1);
  }

  console.log('Evaluation completed successfully.\n');
}

/**
 * Main entry point for the summary evaluation runner.
 */
async function main(): Promise<void> {
  const options = parseArgs_();

  console.log('\n=== Summary Evaluation Runner ===');
  console.log(`Tier: ${options.tier}`);
  console.log(`Provider: ${options.provider}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Allow empty: ${options.allowEmpty}`);
  if (options.endpoint) {
    console.log(`Endpoint filter: ${options.endpoint}`);
  }
  console.log('');

  // Load and validate cases
  const cases_ = loadAndFilterCases(loadCasesForTier, filterByEndpoint, options);

  // Summary output
  console.log(`Loaded ${cases_.length} case(s):`);
  for (const c of cases_) {
    console.log(
      `  - [${c.endpoint}] ${c.caseId} (facts: ${c.expected.requiredFacts.length}, forbidden: ${c.expected.forbiddenClaims.length})`,
    );
  }
  console.log('');

  if (options.dryRun) {
    console.log('Dry run complete. No evaluation executed.\n');
    return;
  }

  console.log('Executing evaluation...\n');
  const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
  const { summaryBridge } = await import('./bridge.js');
  const { report } = await runSuiteWithPromptfoo(summaryBridge, {
    tier: options.tier,
    dryRun: options.dryRun,
    allowEmpty: options.allowEmpty,
    runner: 'promptfoo',
    provider: options.provider,
    verbose: options.verbose,
    ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
  });

  outputReport(report, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
