/**
 * Summary Evaluation Runner Entry Point
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * Usage:
 *   pnpm eval:summary --tier smoke
 *   pnpm eval:summary --tier core --dry-run --allow-empty
 *   pnpm eval:summary --tier smoke --endpoint /v2/retrieval/search
 *   pnpm eval:summary --tier core --json --json-path ./reports/summary.json
 *   pnpm eval:summary --tier smoke --provider fallback
 */

import { parseArgs } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';

import {
  summaryEvalCaseSchema,
  type SummaryEvalCase,
  type SummaryEvalTier,
  type SummaryEvalEndpoint,
} from '../../packages/contracts/src/index.js';

// Import tier datasets
import { summarySmokeCases } from './smoke.js';
import { coreCases } from './core.js';

// Import evaluation modules
import { createJudge, fallbackJudge } from './lib/judge.js';
import { evaluateSummaryVerdicts } from './lib/assertions.js';
import { buildSummaryReport, summarizeReport } from './lib/report.js';
import { formatSummaryReport, formatCompactSummary, formatCaseDetail } from './lib/format.js';
import type { RunnerOptions, SummaryCaseResult, JudgeProvider } from './lib/types.js';

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
    console.error(`Invalid endpoint: ${endpoint}. Must be '/v1/retrieval/search' or '/v2/retrieval/search'.`);
    process.exit(1);
  }

  const provider = values.provider as JudgeProvider;
  if (provider !== 'openai' && provider !== 'fallback') {
    console.error(`Invalid provider: ${provider}. Must be 'openai' or 'fallback'.`);
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
    provider,
  };
}

// =============================================================================
// Case Loading
// =============================================================================

/**
 * Load cases for the specified tier.
 *
 * @param tier - Evaluation tier
 * @returns Array of validated cases
 */
export function loadCases(tier: SummaryEvalTier): SummaryEvalCase[] {
  const rawCases = tier === 'smoke' ? summarySmokeCases : coreCases;

  // Validate each case against the schema
  const validatedCases: SummaryEvalCase[] = [];
  for (const rawCase of rawCases) {
    try {
      const parsed = summaryEvalCaseSchema.parse(rawCase);
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
// Case Execution
// =============================================================================

/**
 * Execution context for summary evaluation.
 */
interface ExecutionContext {
  options: RunOptions;
}

/**
 * Create an execution context.
 */
function createExecutionContext(options: RunOptions): ExecutionContext {
  return { options };
}

/**
 * Execute a single summary evaluation case.
 *
 * For now, this uses mock data since we don't have actual endpoint execution.
 * The runner structure is in place for future integration.
 *
 * @param ctx - Execution context
 * @param case_ - Case to execute
 * @returns Case result
 */
export async function executeSummaryCase(
  ctx: ExecutionContext,
  case_: SummaryEvalCase,
): Promise<SummaryCaseResult> {
  const startTime = Date.now();
  const warnings: Array<{ code: string; message: string }> = [];

  // For Phase 27-02, we use mock summary execution.
  // In a full implementation, this would:
  // 1. Execute the retrieval request against the endpoint
  // 2. Extract the summary from the response
  // 3. Build context from returned hits/capsules content

  // Generate a mock summary for testing
  const mockSummary = generateMockSummary(case_);
  const mockContext = generateMockContext(case_);

  // Run judge evaluation
  const judge = createJudge({ provider: ctx.options.provider });
  const judgeResult = judge.evaluate(
    mockSummary,
    mockContext,
    {
      requiredFacts: case_.expected.requiredFacts,
      forbiddenClaims: case_.expected.forbiddenClaims,
    },
  );

  // Evaluate verdicts
  const { verdicts, passed } = evaluateSummaryVerdicts({
    case_,
    judgeResult,
  });

  const durationMs = Date.now() - startTime;

  if (ctx.options.verbose > 0) {
    console.log(`  ${case_.caseId}: ${passed ? 'PASS' : 'FAIL'} (G=${judgeResult.groundednessScore.toFixed(2)}, C=${judgeResult.coverageScore.toFixed(2)})`);
  }

  return {
    case: case_,
    judgeResult,
    passed,
    durationMs,
    warnings,
  };
}

/**
 * Generate mock summary for testing.
 * In production, this would come from the actual endpoint response.
 */
function generateMockSummary(case_: SummaryEvalCase): string {
  // Include some required facts to simulate a reasonable summary
  const parts: string[] = [];

  if (case_.expected.requiredFacts.length > 0) {
    // Include first required fact to simulate partial coverage
    parts.push(case_.expected.requiredFacts[0]!);
  }

  // Add placeholder content
  parts.push('This is a summary of the retrieved knowledge.');

  return parts.join(' ');
}

/**
 * Generate mock context for testing.
 * In production, this would come from the retrieved hits/capsules.
 */
function generateMockContext(case_: SummaryEvalCase): string[] {
  // Generate mock context that includes required facts
  const context: string[] = [];

  for (const fact of case_.expected.requiredFacts) {
    context.push(`Knowledge entry: ${fact}. This is relevant information.`);
  }

  return context;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Main entry point for the summary evaluation runner.
 */
async function main(): Promise<void> {
  const startTime = Date.now();
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
  let cases_: SummaryEvalCase[];
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
    console.log(`  - [${c.endpoint}] ${c.caseId} (facts: ${c.expected.requiredFacts.length}, forbidden: ${c.expected.forbiddenClaims.length})`);
  }
  console.log('');

  if (options.dryRun) {
    console.log('Dry run complete. No evaluation executed.\n');
    return;
  }

  // Execute cases
  console.log('Executing evaluation...\n');
  const ctx = createExecutionContext(options);
  const caseResults: SummaryCaseResult[] = [];

  for (const case_ of cases_) {
    const result = await executeSummaryCase(ctx, case_);
    caseResults.push(result);
  }

  // Build report
  const runnerOptions: RunnerOptions = {
    tier: options.tier,
    endpoint: options.endpoint,
    json: options.json,
    jsonPath: options.jsonPath,
    allowEmpty: options.allowEmpty,
    dryRun: options.dryRun,
    verbose: options.verbose,
    llmProvider: options.provider,
  };

  const report = buildSummaryReport({
    caseResults,
    options: runnerOptions,
    durationMs: Date.now() - startTime,
    llmProvider: options.provider,
  });

  // Print terminal output
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

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
