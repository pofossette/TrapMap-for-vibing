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

import {
  type RetrievalEvalScenario,
  type SummaryEvalCase,
  type SummaryEvalEndpoint,
  type SummaryEvalTier,
  summaryEvalCaseSchema,
} from '@trapmap/contracts';

import { summaryCoreCases } from './core.js';
// Import tier datasets
import { summarySmokeCases } from './smoke.js';

// Import summary scenarios for fixture loading
import { summaryCoreScenariosMap } from './scenarios/core/summary-core-scenarios.js';
import { summarySmokeScenariosMap } from './scenarios/smoke/summary-smoke-scenarios.js';

import { evaluateSummaryVerdicts } from './lib/assertions.js';
import { formatCaseDetail, formatCompactSummary, formatSummaryReport } from './lib/format.js';
// Import evaluation modules
import { createJudge, fallbackJudge } from './lib/judge.js';
import { buildSummaryReport, summarizeReport } from './lib/report.js';
import type { JudgeProvider, RunnerOptions, SummaryCaseResult } from './lib/types.js';

// Import retrieval adapters for real endpoint execution
import {
  type ExecutionContext as RetrievalExecutionContext,
  closeExecutionContext,
  createActorSession,
  createExecutionContext as createRetrievalContext,
  executeThroughRoute,
  seedScenarioFixtures,
} from '../retrieval/lib/adapters.js';

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
  const rawCases = tier === 'smoke' ? summarySmokeCases : summaryCoreCases;

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
// Scenario Loading
// =============================================================================

/**
 * Load a summary scenario by scenarioId.
 * Returns the scenario fixture definition for seeding.
 *
 * @param scenarioId - Scenario identifier
 * @returns Scenario definition or undefined
 */
function loadSummaryScenario(scenarioId: string): RetrievalEvalScenario | undefined {
  // Check core scenarios
  const coreScenario = summaryCoreScenariosMap[scenarioId];
  if (coreScenario) return coreScenario;

  // Check smoke scenarios
  const smokeScenario = summarySmokeScenariosMap[scenarioId];
  if (smokeScenario) return smokeScenario;

  return undefined;
}

// =============================================================================
// Case Execution
// =============================================================================

/**
 * Execution context for summary evaluation.
 * Wraps the retrieval execution context.
 */
interface ExecutionContext {
  options: RunOptions;
  retrievalCtx: RetrievalExecutionContext | null;
}

/**
 * Create an execution context.
 */
function createExecutionContext(options: RunOptions): ExecutionContext {
  return { options, retrievalCtx: null };
}

/**
 * Execute a single summary evaluation case.
 *
 * Executes against real endpoint with seeded fixtures, extracts summary and
 * context from response, then runs judge evaluation.
 *
 * @param ctx - Execution context
 * @param case_ - Case to execute
 * @returns Case result with trace fields
 */
export async function executeSummaryCase(
  ctx: ExecutionContext,
  case_: SummaryEvalCase,
): Promise<SummaryCaseResult> {
  const startTime = Date.now();
  const warnings: Array<{ code: string; message: string }> = [];

  // Create retrieval execution context
  const retrievalCtx = await createRetrievalContext();

  try {
    // Load scenario for fixture seeding
    const scenario = loadSummaryScenario(case_.scenarioId);

    if (!scenario) {
      warnings.push({
        code: 'scenario-not-found',
        message: `Scenario not found: ${case_.scenarioId}`,
      });

      // Return early with empty result
      const judgeResult = fallbackJudge({
        summaryText: '',
        context: [],
        requiredFacts: case_.expected.requiredFacts,
        forbiddenClaims: case_.expected.forbiddenClaims,
      });

      return {
        case: case_,
        judgeResult,
        passed: false,
        durationMs: Date.now() - startTime,
        warnings,
        rawResponse: null,
        contextTrace: [],
        summaryText: null,
      };
    }

    // Build a RetrievalEvalCase-compatible object for fixture seeding
    const retrievalCase = {
      scenarioId: case_.scenarioId,
      endpoint: case_.endpoint,
      request: case_.request,
    };

    // Seed fixtures for this scenario (pass scenario directly since loadScenario doesn't know summary scenarios)
    await seedScenarioFixtures(retrievalCtx, retrievalCase as any, scenario);

    // Set actor session with scenario permissions
    await createActorSession(retrievalCtx, scenario.actor);

    // Execute retrieval through the route
    const adapterResult = await executeThroughRoute(retrievalCtx, retrievalCase as any);

    // Extract raw response for trace
    const rawResponse = adapterResult.result.rawResponse;

    // Extract summary text from response
    const rawResp = rawResponse as Record<string, any>;
    const summaryText: string | null = rawResp?.summary?.text ?? null;

    // Build context array based on endpoint type
    let contextTrace: string[] = [];

    if (case_.endpoint === '/v1/retrieval/search') {
      // v1: Extract from globalConstraints and projectKnowledge
      const globalConstraints = rawResp?.globalConstraints ?? [];
      const projectKnowledge = rawResp?.projectKnowledge ?? [];

      contextTrace = [
        ...globalConstraints.map((e: any) => e?.detail ?? '').filter(Boolean),
        ...projectKnowledge.map((e: any) => e?.detail ?? '').filter(Boolean),
      ];
    } else {
      // v2: Extract from capsules
      const capsules = rawResp?.capsules ?? [];

      contextTrace = capsules
        .map((c: any) => `${c?.content ?? ''} ${c?.problem ?? ''} ${c?.goal ?? ''}`.trim())
        .filter(Boolean);
    }

    // Run judge evaluation with real summary and context
    const judge = createJudge({ provider: ctx.options.provider });
    const judgeResult = judge.evaluate(summaryText ?? '', contextTrace, {
      requiredFacts: case_.expected.requiredFacts,
      forbiddenClaims: case_.expected.forbiddenClaims,
    });

    // Evaluate verdicts
    const { verdicts, passed } = evaluateSummaryVerdicts({
      case_,
      judgeResult,
    });

    const durationMs = Date.now() - startTime;

    if (ctx.options.verbose > 0) {
      console.log(
        `  ${case_.caseId}: ${passed ? 'PASS' : 'FAIL'} (G=${judgeResult.groundednessScore.toFixed(2)}, C=${judgeResult.coverageScore.toFixed(2)})`,
      );
    }

    return {
      case: case_,
      judgeResult,
      passed,
      durationMs,
      warnings,
      rawResponse,
      contextTrace,
      summaryText,
    };
  } finally {
    // Always close the retrieval context
    await closeExecutionContext(retrievalCtx);
  }
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
    console.log(
      `  - [${c.endpoint}] ${c.caseId} (facts: ${c.expected.requiredFacts.length}, forbidden: ${c.expected.forbiddenClaims.length})`,
    );
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
