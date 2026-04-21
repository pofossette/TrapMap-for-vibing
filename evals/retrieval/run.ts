/**
 * Retrieval Evaluation Runner Entry Point
 *
 * Phase 25-01: Thin entrypoint that loads and validates datasets.
 * Phase 26 will add metrics calculation and report generation.
 *
 * Usage:
 *   pnpm exec tsx evals/retrieval/run.ts --tier smoke
 *   pnpm exec tsx evals/retrieval/run.ts --tier core --dry-run --allow-empty
 */

import { parseArgs } from 'node:util';

import {
  retrievalEvalCaseSchema,
  type RetrievalEvalCase,
  type RetrievalEvalTier,
} from '../../packages/contracts/src/index.js';

// Import tier datasets (Phase 25-02 will populate these)
import { smokeCases } from './smoke.js';
import { coreCases } from './core.js';

interface RunOptions {
  tier: RetrievalEvalTier;
  dryRun: boolean;
  allowEmpty: boolean;
  endpoint?: '/v1/retrieval/search' | '/v2/retrieval/search';
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

/**
 * Main entry point for the retrieval evaluation runner.
 */
async function main(): Promise<void> {
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
    console.log('Phase 26 will add:');
    console.log('  - Metrics calculation (Hit@K, MRR, nDCG)');
    console.log('  - Governance leakage detection');
    console.log('  - Report generation');
    console.log('');
    return;
  }

  // Phase 26 will implement actual evaluation
  console.error('Evaluation execution not implemented in Phase 25-01.');
  console.error('Use --dry-run to validate layout and contracts.\n');
  process.exit(1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});