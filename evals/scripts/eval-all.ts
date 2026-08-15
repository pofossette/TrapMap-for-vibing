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
 *
 * The retrieval and summary suite runners are exported for reuse by
 * evals/scripts/eval-ci.ts (the CI runner is the only other consumer).
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { AgentPlanningEvalReport } from '../../packages/contracts/src/domain/evals/agent-planning.js';
import type { AgentPlanningEvalCase } from '../../packages/contracts/src/domain/evals/agent-planning.js';
import type { LabelAlignmentEvalReport } from '../../packages/contracts/src/domain/evals/label-alignment.js';
import type {
  RetrievalEvalReport,
  SummaryEvalReport,
} from '../../packages/contracts/src/domain/evals/report.js';
import { buildAgentPlanningPlatformEvents } from '../agent-planning/lib/platform-events.js';
import type { GraphExtractionBridgeReport } from '../graph-extraction/bridge.js';
import type { IngestionBridgeReport } from '../ingestion/bridge.js';
import { pushSliceTable } from '../lib/eval-report.js';
import {
  type EvalPlatformAdapterKind,
  type EvalPlatformEvent,
  closePlatformAdapterSafely,
  createEvalPlatformAdapter,
  publishPlatformEventSafely,
} from '../lib/platform/adapter.js';
import { resolveLangfuseAdapterConfigFromEnv } from '../lib/platform/langfuse-config.js';
import { buildRetrievalPlatformEvents } from '../retrieval/lib/platform-events.js';
import type { RunnerSummary } from '../retrieval/lib/types.js';
import { buildSummaryPlatformEvents } from '../summary/lib/platform-events.js';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

export interface EvalAllOptions {
  tier: 'smoke' | 'core';
  json: boolean;
  jsonPath?: string;
  platform?: EvalPlatformAdapterKind;
  platformOutputDir?: string;
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
      platform: {
        type: 'string',
      },
      'platform-output-dir': {
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

  if (
    values.platform !== undefined &&
    values.platform !== 'noop' &&
    values.platform !== 'json-archive' &&
    values.platform !== 'langfuse'
  ) {
    console.error(
      `Invalid platform: ${values.platform}. Must be 'noop', 'json-archive', or 'langfuse'.`,
    );
    process.exit(1);
  }

  return {
    tier,
    json: values.json,
    jsonPath: values['json-path'],
    platform: values.platform,
    platformOutputDir: values['platform-output-dir'],
    verbose: values.verbose,
    dryRun: values['dry-run'],
    allowEmpty: values['allow-empty'],
  };
}

// =============================================================================
// Combined Report Types
// =============================================================================

export interface RetrievalResult {
  passed: boolean;
  report: RetrievalEvalReport | null;
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

export interface SummaryResult {
  passed: boolean;
  report: SummaryEvalReport | null;
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

interface GraphExtractionResult {
  passed: boolean;
  totalFixtures: number;
  avgNodeF1: number;
  avgEdgeF1: number;
  avgStrengthAccuracy: number;
  durationMs: number;
}

interface IngestionResult {
  passed: boolean;
  totalBundles: number;
  passedBundles: number;
  failedBundles: number;
  passRate: number;
  durationMs: number;
}

interface AgentPlanningResult {
  passed: boolean;
  report: AgentPlanningEvalReport | null;
  durationMs: number;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    avgScore: number;
  };
}

interface LabelAlignmentResult {
  passed: boolean;
  report: unknown;
  durationMs: number;
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
    passRate: number;
    alignmentAccuracy: number;
    falseMerges: number;
    missedMerges: number;
  };
}

interface CombinedReport {
  schemaVersion: 1;
  timestamp: string;
  durationMs: number;
  tier: 'smoke' | 'core';
  retrieval: RetrievalResult | null;
  summary: SummaryResult | null;
  graphExtraction: GraphExtractionResult | null;
  ingestion: IngestionResult | null;
  agentPlanning: AgentPlanningResult | null;
  labelAlignment: LabelAlignmentResult | null;
  overall: {
    passed: boolean;
    totalCases: number;
    passedCases: number;
    failedCases: number;
  };
}

interface RunUnifiedEvaluationResult {
  combinedReport: CombinedReport;
  exitCode: number;
}

interface RunUnifiedEvaluationDeps {
  createPlatformAdapter: typeof createEvalPlatformAdapter;
  buildAgentPlanningPlatformEvents: typeof buildAgentPlanningPlatformEvents;
  buildRetrievalPlatformEvents: typeof buildRetrievalPlatformEvents;
  buildSummaryPlatformEvents: typeof buildSummaryPlatformEvents;
  publishPlatformEvent: typeof publishPlatformEventSafely;
  closePlatformAdapter: typeof closePlatformAdapterSafely;
  warn: typeof console.warn;
  log: typeof console.log;
  error: typeof console.error;
  runRetrievalEval: typeof runRetrievalEval;
  runSummaryEval: typeof runSummaryEval;
  runGraphExtractionEval: typeof runGraphExtractionEval;
  runIngestionEval: typeof runIngestionEval;
  runAgentPlanningEval: typeof runAgentPlanningEval;
  runLabelAlignmentEval: typeof runLabelAlignmentEval;
  resolveLangfuseConfigFromEnv: typeof resolveLangfuseAdapterConfigFromEnv;
}

interface RunUnifiedEvaluationState {
  retrieval: RetrievalResult | null;
  summary: SummaryResult | null;
  graphExtraction: GraphExtractionResult | null;
  ingestion: IngestionResult | null;
  agentPlanning: AgentPlanningResult | null;
  labelAlignment: LabelAlignmentResult | null;
}

class FatalEvalError extends Error {
  readonly result: RunUnifiedEvaluationResult;

  constructor(result: RunUnifiedEvaluationResult) {
    super('fatal eval failure');
    this.result = result;
  }
}

function logLangfuseAdapterEnabled(
  log: typeof console.log,
  config: NonNullable<
    Awaited<ReturnType<typeof resolveLangfuseAdapterConfigFromEnv>> extends {
      ok: true;
      config: infer T;
    }
      ? T
      : never
  >,
): void {
  log(
    `[eval-platform] langfuse adapter enabled: baseUrl=${config.baseUrl} flushTimeoutMs=${config.flushTimeoutMs}.`,
  );
}

function getRunUnifiedEvaluationDeps(): RunUnifiedEvaluationDeps {
  return {
    createPlatformAdapter: createEvalPlatformAdapter,
    buildAgentPlanningPlatformEvents,
    buildRetrievalPlatformEvents,
    buildSummaryPlatformEvents,
    publishPlatformEvent: publishPlatformEventSafely,
    closePlatformAdapter: closePlatformAdapterSafely,
    warn: console.warn,
    log: console.log,
    error: console.error,
    runRetrievalEval,
    runSummaryEval,
    runGraphExtractionEval,
    runIngestionEval,
    runAgentPlanningEval,
    runLabelAlignmentEval,
    resolveLangfuseConfigFromEnv: resolveLangfuseAdapterConfigFromEnv,
  };
}

function createPlatformAdapterForOptions(
  options: EvalAllOptions,
  deps: RunUnifiedEvaluationDeps,
): ReturnType<RunUnifiedEvaluationDeps['createPlatformAdapter']> | null {
  if (options.platform === 'langfuse') {
    const langfuseConfig = deps.resolveLangfuseConfigFromEnv(process.env);
    if (!langfuseConfig.ok) {
      deps.warn(langfuseConfig.warning);
      return null;
    }
    logLangfuseAdapterEnabled(deps.log, langfuseConfig.config);
    return deps.createPlatformAdapter({
      kind: 'langfuse',
      ...langfuseConfig.config,
    });
  }

  if (options.platform) {
    return deps.createPlatformAdapter({
      kind: options.platform,
      outputDir: options.platformOutputDir,
    });
  }

  return null;
}

function logRunnerBanner(options: EvalAllOptions, deps: RunUnifiedEvaluationDeps): void {
  deps.log('');
  deps.log('╔══════════════════════════════════════════════════════════════╗');
  deps.log('║              Unified Evaluation Runner                       ║');
  deps.log('╚══════════════════════════════════════════════════════════════╝');
  deps.log('');
  deps.log(`Tier: ${options.tier}`);
  deps.log(`Dry run: ${options.dryRun}`);
  deps.log(`Allow empty: ${options.allowEmpty}`);
  deps.log(`JSON output: ${options.json}`);
  if (options.jsonPath) {
    deps.log(`JSON path: ${options.jsonPath}`);
  }
  if (options.platform) {
    deps.log(`Platform adapter: ${options.platform}`);
  }
  deps.log('');
}

/**
 * Run one suite section. Fatal failures (not in dry-run/allow-empty) abort the
 * whole run by throwing FatalEvalError carrying the failure report; recoverable
 * failures fall back to `null`, matching the previous per-suite behavior.
 */
async function runSuiteSection<TResult>(params: {
  deps: RunUnifiedEvaluationDeps;
  options: EvalAllOptions;
  sectionName: string;
  startTime: number;
  run: (options: EvalAllOptions) => Promise<TResult | null>;
  completionMessage: (result: TResult) => string;
  buildFailureResult: () => RunUnifiedEvaluationResult;
}): Promise<TResult | null> {
  const { deps, options, sectionName, run, completionMessage, buildFailureResult } = params;

  deps.log(`--- ${sectionName} ---`);
  try {
    const result = await run(options);
    if (result) {
      deps.log(`  Completed: ${completionMessage(result)}`);
    }
    deps.log('');
    return result;
  } catch (error) {
    deps.error('  Failed:', error);
    if (!options.allowEmpty && !options.dryRun) {
      throw new FatalEvalError(buildFailureResult());
    }
    return null;
  }
}

function buildFailureResult(
  state: RunUnifiedEvaluationState,
  startTime: number,
  tier: EvalAllOptions['tier'],
): RunUnifiedEvaluationResult {
  return {
    combinedReport: {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      tier,
      retrieval: state.retrieval,
      summary: state.summary,
      graphExtraction: state.graphExtraction,
      ingestion: state.ingestion,
      agentPlanning: state.agentPlanning,
      labelAlignment: state.labelAlignment,
      overall: { passed: false, totalCases: 0, passedCases: 0, failedCases: 0 },
    },
    exitCode: 1,
  };
}

function computeOverallTotals(state: RunUnifiedEvaluationState): {
  totalCases: number;
  passedCases: number;
  failedCases: number;
} {
  const totalCases =
    (state.retrieval?.summary.totalCases ?? 0) +
    (state.summary?.summary.totalCases ?? 0) +
    (state.graphExtraction?.totalFixtures ?? 0) +
    (state.ingestion?.totalBundles ?? 0) +
    (state.agentPlanning?.summary.totalCases ?? 0) +
    (state.labelAlignment?.summary.totalCases ?? 0);
  const passedCases =
    (state.retrieval?.summary.passedCases ?? 0) +
    (state.summary?.summary.passedCases ?? 0) +
    (state.graphExtraction?.passed ? (state.graphExtraction?.totalFixtures ?? 0) : 0) +
    (state.ingestion?.passedBundles ?? 0) +
    (state.agentPlanning?.summary.passedCases ?? 0) +
    (state.labelAlignment?.summary.passedCases ?? 0);
  return { totalCases, passedCases, failedCases: totalCases - passedCases };
}

function buildCombinedReport(
  state: RunUnifiedEvaluationState,
  startTime: number,
  tier: EvalAllOptions['tier'],
): CombinedReport {
  const { totalCases, passedCases, failedCases } = computeOverallTotals(state);

  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    tier,
    retrieval: state.retrieval,
    summary: state.summary,
    graphExtraction: state.graphExtraction,
    ingestion: state.ingestion,
    agentPlanning: state.agentPlanning,
    labelAlignment: state.labelAlignment,
    overall: {
      passed:
        failedCases === 0 &&
        (state.retrieval !== null ||
          state.summary !== null ||
          state.graphExtraction !== null ||
          state.ingestion !== null ||
          state.agentPlanning !== null ||
          state.labelAlignment !== null),
      totalCases,
      passedCases,
      failedCases,
    },
  };
}

async function mirrorPlatformEvents(params: {
  adapter: NonNullable<ReturnType<RunUnifiedEvaluationDeps['createPlatformAdapter']>>;
  deps: RunUnifiedEvaluationDeps;
  options: EvalAllOptions;
  suiteRunId: string;
  state: RunUnifiedEvaluationState;
}): Promise<void> {
  const { adapter, deps, options, suiteRunId, state } = params;

  try {
    const suiteEvents = await buildSuitePlatformEvents(
      options,
      suiteRunId,
      state.retrieval,
      state.summary,
      state.agentPlanning,
      deps,
    );
    let publishWarnings = 0;
    for (const event of suiteEvents) {
      const publishResult = await deps.publishPlatformEvent(adapter, deps.warn, event);
      if (publishResult?.ok === false) {
        publishWarnings += 1;
      }
    }
    if (publishWarnings === 0) {
      deps.log(
        `[eval-platform] ${adapter.kind} adapter mirrored ${suiteEvents.length} suite events without publish warnings.`,
      );
    } else {
      deps.warn(
        `[eval-platform] ${adapter.kind} adapter mirrored ${suiteEvents.length} suite events with ${publishWarnings} publish warning(s).`,
      );
    }
  } catch (error) {
    deps.warn(
      `[eval-platform] ${adapter.kind} suite event mirroring failed; continuing without affecting eval status.`,
      error,
    );
  }

  try {
    const closeResult = await deps.closePlatformAdapter(adapter, deps.warn);
    if (closeResult?.ok !== false) {
      deps.log(`[eval-platform] ${adapter.kind} adapter flush completed without close warnings.`);
    }
  } catch (error) {
    deps.warn(
      `[eval-platform] ${adapter.kind} adapter close failed; continuing without affecting eval status.`,
      error,
    );
  }
}

function buildPlatformTags(options: EvalAllOptions): string[] {
  const tags: string[] = [];
  if (options.dryRun) {
    tags.push('dry-run');
  }
  if (options.allowEmpty) {
    tags.push('allow-empty');
  }
  return tags;
}

async function buildSuitePlatformEvents(
  options: EvalAllOptions,
  suiteRunId: string,
  retrievalResult: RetrievalResult | null,
  summaryResult: SummaryResult | null,
  agentPlanningResult: AgentPlanningResult | null,
  deps: Pick<
    RunUnifiedEvaluationDeps,
    | 'buildAgentPlanningPlatformEvents'
    | 'buildRetrievalPlatformEvents'
    | 'buildSummaryPlatformEvents'
  >,
): Promise<EvalPlatformEvent[]> {
  const tags = buildPlatformTags(options);
  const events: EvalPlatformEvent[] = [];

  if (retrievalResult?.report) {
    events.push(
      ...(await deps.buildRetrievalPlatformEvents({
        suiteRunId: `${suiteRunId}:retrieval`,
        baseTags: tags,
        report: retrievalResult.report,
      })),
    );
  }

  if (summaryResult?.report) {
    events.push(
      ...(await deps.buildSummaryPlatformEvents({
        suiteRunId: `${suiteRunId}:summary`,
        baseTags: tags,
        report: summaryResult.report,
      })),
    );
  }

  if (agentPlanningResult?.report) {
    events.push(
      ...(await deps.buildAgentPlanningPlatformEvents({
        suiteRunId: `${suiteRunId}:agent-planning`,
        baseTags: tags,
        report: agentPlanningResult.report,
      })),
    );
  }

  return events;
}

// =============================================================================
// Evaluation Execution Functions
// =============================================================================

/**
 * Run retrieval evaluation through the promptfoo bridge and return results.
 *
 * Shared with the CI runner (eval-ci.ts): in non-dry-run mode a runner
 * failure is thrown for the caller to handle, in dry-run mode it degrades
 * to a null result.
 */
export async function runRetrievalEval(options: EvalAllOptions): Promise<RetrievalResult | null> {
  const startTime = Date.now();

  try {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { retrievalBridge } = await import('../retrieval/bridge.js');
    const { buildReport } = await import('../retrieval/lib/report.js');

    const result = await runSuiteWithPromptfoo(retrievalBridge, {
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: options.allowEmpty,
      runner: 'promptfoo',
      verbose: options.verbose ? 1 : 0,
    });
    const summary = result.report as RunnerSummary;

    // Native dry-run short-circuits before executing and reports the loaded
    // case count as passed with a null report; preserve that shape exactly.
    if (options.dryRun) {
      return {
        passed: true,
        report: null,
        durationMs: Date.now() - startTime,
        summary: {
          totalCases: result.caseCount,
          passedCases: result.caseCount,
          failedCases: 0,
          passRate: 1,
          slices: [],
        },
      };
    }

    // Rebuild the canonical RetrievalEvalReport from the bridge case results so
    // the CombinedReport sub-object and platform events keep the native shape.
    const report = buildReport(summary.caseResults, summary.options, summary.durationMs);

    return {
      passed: report.summary.failedCases === 0,
      report,
      durationMs: Date.now() - startTime,
      summary: {
        totalCases: report.summary.totalCases,
        passedCases: report.summary.passedCases,
        failedCases: report.summary.failedCases,
        passRate: report.summary.passRate,
        slices: report.slices.map((slice) => ({
          tier: slice.slice.tier,
          endpoint: slice.slice.endpoint,
          ...(slice.slice.mode !== undefined ? { mode: slice.slice.mode } : {}),
          caseCount: slice.caseCount,
          avgHitAt1: slice.avgHitAt1,
          avgMrr: slice.avgMrr,
          avgNdcg: slice.avgNdcg,
          passRate: slice.passRate,
        })),
      },
    };
  } catch (error) {
    // If the bridge is unavailable, fall back to dry-run simulation
    if (options.dryRun) {
      console.log('  Retrieval evaluation: dry-run mode (bridge not available)');
      return null;
    }

    console.error('Retrieval evaluation failed:', error);
    throw error;
  }
}

/**
 * Run graph extraction evaluation through the promptfoo bridge.
 *
 * The aggregate runner always evaluates graph-extraction deterministically (no
 * LLM calls): the bridge is invoked in dry-run so every fixture runs the
 * deterministic "unavailable" extraction, preserving the no-API dependency and
 * CI-stability intent of the previous keyword approximation.
 */
async function runGraphExtractionEval(
  options: EvalAllOptions,
): Promise<GraphExtractionResult | null> {
  const startTime = Date.now();

  try {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { graphExtractionBridge } = await import('../graph-extraction/bridge.js');

    const result = await runSuiteWithPromptfoo(graphExtractionBridge, {
      tier: options.tier,
      dryRun: true,
      allowEmpty: false,
      runner: 'promptfoo',
    });
    const report = result.report as GraphExtractionBridgeReport;

    return {
      passed: true, // Eval framework itself passed
      totalFixtures: report.totalFixtures,
      avgNodeF1: report.aggregate.avgNodeF1,
      avgEdgeF1: report.aggregate.avgEdgeF1,
      avgStrengthAccuracy: report.aggregate.avgStrengthAccuracy,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    if (options.dryRun) {
      console.log('  Graph extraction evaluation: dry-run mode (runner not available)');
      return null;
    }
    console.error('Graph extraction evaluation failed:', error);
    return null;
  }
}

/**
 * Run ingestion/derivation evaluation through the promptfoo bridge.
 *
 * The aggregate runner always runs ingestion on bundled fixtures (never the
 * downloaded data file), matching the native "always dry-run in the unified
 * runner" behavior, so the bridge is invoked in dry-run.
 */
async function runIngestionEval(options: EvalAllOptions): Promise<IngestionResult | null> {
  const startTime = Date.now();

  try {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { ingestionBridge } = await import('../ingestion/bridge.js');

    const result = await runSuiteWithPromptfoo(ingestionBridge, {
      tier: options.tier,
      dryRun: true,
      allowEmpty: false,
      runner: 'promptfoo',
    });
    const report = result.report as IngestionBridgeReport;

    return {
      passed: report.passedBundles === report.totalBundles,
      totalBundles: report.totalBundles,
      passedBundles: report.passedBundles,
      failedBundles: report.failedBundles,
      passRate: report.passRate,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    if (options.dryRun) {
      console.log('  Ingestion evaluation: dry-run mode (not available)');
      return null;
    }
    console.error('Ingestion evaluation failed:', error);
    return null;
  }
}

/**
 * Run summary evaluation through the promptfoo bridge and return results.
 *
 * Shared with the CI runner (eval-ci.ts): in non-dry-run mode a runner
 * failure is thrown for the caller to handle, in dry-run mode it degrades
 * to a null result.
 */
export async function runSummaryEval(options: EvalAllOptions): Promise<SummaryResult | null> {
  const startTime = Date.now();

  try {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { summaryBridge } = await import('../summary/bridge.js');

    const result = await runSuiteWithPromptfoo(summaryBridge, {
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: options.allowEmpty,
      runner: 'promptfoo',
      provider: 'fallback',
      verbose: options.verbose ? 1 : 0,
    });
    const report = result.report as SummaryEvalReport;

    // Native dry-run short-circuits before executing and reports the loaded
    // case count as passed with a null report; preserve that shape exactly.
    if (options.dryRun) {
      return {
        passed: true,
        report: null,
        durationMs: Date.now() - startTime,
        summary: {
          totalCases: result.caseCount,
          passedCases: result.caseCount,
          failedCases: 0,
          passRate: 1,
          avgGroundedness: 1,
          avgCoverage: 1,
          forbiddenClaimHits: 0,
        },
      };
    }

    return {
      passed: report.summary.failedCases === 0,
      report,
      durationMs: Date.now() - startTime,
      summary: {
        totalCases: report.summary.totalCases,
        passedCases: report.summary.passedCases,
        failedCases: report.summary.failedCases,
        passRate: report.summary.passRate,
        avgGroundedness: report.summary.avgGroundedness,
        avgCoverage: report.summary.avgCoverage,
        forbiddenClaimHits: report.summary.forbiddenClaimHits,
      },
    };
  } catch (error) {
    // If the bridge is unavailable, fall back to dry-run simulation
    if (options.dryRun) {
      console.log('  Summary evaluation: dry-run mode (bridge not available)');
      return null;
    }

    console.error('Summary evaluation failed:', error);
    throw error;
  }
}

async function runAgentPlanningEval(options: EvalAllOptions): Promise<AgentPlanningResult | null> {
  const startTime = Date.now();

  try {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { agentPlanningBridge } = await import('../agent-planning/bridge.js');

    const result = await runSuiteWithPromptfoo(agentPlanningBridge, {
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: false,
      runner: 'promptfoo',
      provider: options.dryRun ? 'fallback' : 'openai',
    });
    const report = result.report as AgentPlanningEvalReport;

    return {
      passed: report.summary.failedCases === 0,
      report,
      durationMs: Date.now() - startTime,
      summary: {
        totalCases: report.summary.totalCases,
        passedCases: report.summary.passedCases,
        failedCases: report.summary.failedCases,
        passRate: report.summary.passRate,
        avgScore: report.summary.avgScore,
      },
    };
  } catch (error) {
    if (options.dryRun) {
      console.log('  Agent planning evaluation: dry-run mode (bridge not available)');
      return null;
    }

    console.error('Agent planning evaluation failed:', error);
    throw error;
  }
}

async function runLabelAlignmentEval(
  options: EvalAllOptions,
): Promise<LabelAlignmentResult | null> {
  const startTime = Date.now();

  try {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { labelAlignmentBridge } = await import('../label-alignment/bridge.js');

    const result = await runSuiteWithPromptfoo(labelAlignmentBridge, {
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: false,
      runner: 'promptfoo',
      mode: options.dryRun ? 'dry-run' : 'live',
    });
    const report = result.report as LabelAlignmentEvalReport;

    return {
      passed: report.summary.failedCases === 0,
      report,
      durationMs: Date.now() - startTime,
      summary: {
        totalCases: report.summary.totalCases,
        passedCases: report.summary.passedCases,
        failedCases: report.summary.failedCases,
        passRate: report.summary.passRate,
        alignmentAccuracy: report.summary.alignmentAccuracy,
        falseMerges: report.summary.falseMerges,
        missedMerges: report.summary.missedMerges,
      },
    };
  } catch (error) {
    if (options.dryRun) {
      console.log('  Label alignment evaluation: dry-run mode (bridge not available)');
      return null;
    }

    console.error('Label alignment evaluation failed:', error);
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

      pushSliceTable(
        lines,
        ret.summary.slices.map((slice) => ({
          tier: slice.tier,
          endpoint: slice.endpoint,
          mode: slice.mode || 'default',
          caseCount: slice.caseCount,
          passRate: slice.passRate,
          avgHitAt1: slice.avgHitAt1,
          avgMrr: slice.avgMrr,
          avgNdcg: slice.avgNdcg,
        })),
      );
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

  // Graph Extraction Evaluation Section
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                  Graph Extraction Evaluation');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (report.graphExtraction) {
    const ge = report.graphExtraction;
    lines.push('');
    lines.push(`Total fixtures: ${ge.totalFixtures}`);
    lines.push(`Avg Node F1: ${ge.avgNodeF1.toFixed(3)}`);
    lines.push(`Avg Edge F1: ${ge.avgEdgeF1.toFixed(3)}`);
    lines.push(`Strength Accuracy: ${ge.avgStrengthAccuracy.toFixed(3)}`);
    lines.push(`Duration: ${ge.durationMs}ms`);
    lines.push('');
  } else {
    lines.push('');
    lines.push('(No graph extraction evaluation data - dry-run or skipped)');
    lines.push('');
  }

  // Ingestion / Derivation Evaluation Section
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('               Ingestion / Derivation Evaluation');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (report.ingestion) {
    const ing = report.ingestion;
    lines.push('');
    lines.push(`Total bundles: ${ing.totalBundles}`);
    lines.push(`Passed: ${ing.passedBundles}`);
    lines.push(`Failed: ${ing.failedBundles}`);
    lines.push(`Pass rate: ${(ing.passRate * 100).toFixed(1)}%`);
    lines.push(`Duration: ${ing.durationMs}ms`);
    lines.push('');
  } else {
    lines.push('');
    lines.push('(No ingestion evaluation data - dry-run or skipped)');
    lines.push('');
  }

  // Agent Planning Evaluation Section
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                  Agent Planning Evaluation');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (report.agentPlanning) {
    const agent = report.agentPlanning;
    lines.push('');
    lines.push(`Total cases: ${agent.summary.totalCases}`);
    lines.push(`Passed: ${agent.summary.passedCases}`);
    lines.push(`Failed: ${agent.summary.failedCases}`);
    lines.push(`Pass rate: ${(agent.summary.passRate * 100).toFixed(1)}%`);
    lines.push(`Average score: ${agent.summary.avgScore.toFixed(3)}`);
    lines.push(`Duration: ${agent.durationMs}ms`);
    lines.push('');
  } else {
    lines.push('');
    lines.push('(No agent planning evaluation data - dry-run or skipped)');
    lines.push('');
  }

  // Label Alignment Evaluation Section
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('                  Label Alignment Evaluation');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (report.labelAlignment) {
    const label = report.labelAlignment;
    lines.push('');
    lines.push(`Total cases: ${label.summary.totalCases}`);
    lines.push(`Passed: ${label.summary.passedCases}`);
    lines.push(`Failed: ${label.summary.failedCases}`);
    lines.push(`Pass rate: ${(label.summary.passRate * 100).toFixed(1)}%`);
    lines.push(`Alignment accuracy: ${(label.summary.alignmentAccuracy * 100).toFixed(1)}%`);
    lines.push(`False merges: ${label.summary.falseMerges}`);
    lines.push(`Missed merges: ${label.summary.missedMerges}`);
    lines.push(`Duration: ${label.durationMs}ms`);
    lines.push('');
  } else {
    lines.push('');
    lines.push('(No label alignment evaluation data - dry-run or skipped)');
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

export async function runUnifiedEvaluation(
  options: EvalAllOptions,
  deps: Partial<RunUnifiedEvaluationDeps> = {},
): Promise<RunUnifiedEvaluationResult> {
  const resolvedDeps: RunUnifiedEvaluationDeps = {
    ...getRunUnifiedEvaluationDeps(),
    ...deps,
  };
  const startTime = Date.now();
  const platformRunSeed = randomUUID();
  const adapter = createPlatformAdapterForOptions(options, resolvedDeps);

  logRunnerBanner(options, resolvedDeps);

  // Run evaluations
  resolvedDeps.log('Running evaluations...\n');

  const state: RunUnifiedEvaluationState = {
    retrieval: null,
    summary: null,
    graphExtraction: null,
    ingestion: null,
    agentPlanning: null,
    labelAlignment: null,
  };

  const failureResult = (): RunUnifiedEvaluationResult =>
    buildFailureResult(state, startTime, options.tier);

  try {
    state.retrieval = await runSuiteSection({
      deps: resolvedDeps,
      options,
      sectionName: 'Retrieval Evaluation',
      startTime,
      run: (opts) => resolvedDeps.runRetrievalEval(opts),
      completionMessage: (result) =>
        `${result.summary.passedCases}/${result.summary.totalCases} passed`,
      buildFailureResult: failureResult,
    });
    state.summary = await runSuiteSection({
      deps: resolvedDeps,
      options,
      sectionName: 'Summary Evaluation',
      startTime,
      run: (opts) => resolvedDeps.runSummaryEval(opts),
      completionMessage: (result) =>
        `${result.summary.passedCases}/${result.summary.totalCases} passed`,
      buildFailureResult: failureResult,
    });
    state.graphExtraction = await runSuiteSection({
      deps: resolvedDeps,
      options,
      sectionName: 'Graph Extraction Evaluation',
      startTime,
      run: (opts) => resolvedDeps.runGraphExtractionEval(opts),
      completionMessage: (result) =>
        `${result.totalFixtures} fixtures, Node F1=${result.avgNodeF1.toFixed(3)}`,
      buildFailureResult: failureResult,
    });
    state.ingestion = await runSuiteSection({
      deps: resolvedDeps,
      options,
      sectionName: 'Ingestion / Derivation Evaluation',
      startTime,
      run: (opts) => resolvedDeps.runIngestionEval(opts),
      completionMessage: (result) => `${result.passedBundles}/${result.totalBundles} passed`,
      buildFailureResult: failureResult,
    });
    state.agentPlanning = await runSuiteSection({
      deps: resolvedDeps,
      options,
      sectionName: 'Agent Planning Evaluation',
      startTime,
      run: (opts) => resolvedDeps.runAgentPlanningEval(opts),
      completionMessage: (result) =>
        `${result.summary.passedCases}/${result.summary.totalCases} passed`,
      buildFailureResult: failureResult,
    });
    state.labelAlignment = await runSuiteSection({
      deps: resolvedDeps,
      options,
      sectionName: 'Label Alignment Evaluation',
      startTime,
      run: (opts) => resolvedDeps.runLabelAlignmentEval(opts),
      completionMessage: (result) =>
        `${result.summary.passedCases}/${result.summary.totalCases} passed`,
      buildFailureResult: failureResult,
    });
  } catch (error) {
    if (error instanceof FatalEvalError) {
      return error.result;
    }
    throw error;
  }

  // Build combined report
  const combinedReport = buildCombinedReport(state, startTime, options.tier);

  // Print terminal output
  resolvedDeps.log(formatCombinedReport(combinedReport, options));

  // Write JSON if requested
  if (options.json && options.jsonPath) {
    writeCombinedJsonReport(options.jsonPath, combinedReport);
    resolvedDeps.log(`JSON report written to: ${options.jsonPath}\n`);
  }

  if (adapter) {
    await mirrorPlatformEvents({
      adapter,
      deps: resolvedDeps,
      options,
      suiteRunId: platformRunSeed,
      state,
    });
  }

  // Exit with error code if any failures
  if (!combinedReport.overall.passed && !options.dryRun) {
    resolvedDeps.log(
      `Evaluation completed with ${combinedReport.overall.failedCases} failure(s).\n`,
    );
    return {
      combinedReport,
      exitCode: 1,
    };
  }

  resolvedDeps.log('Evaluation completed successfully.\n');
  return {
    combinedReport,
    exitCode: 0,
  };
}

async function main(): Promise<void> {
  const result = await runUnifiedEvaluation(parseArgs_());
  process.exit(result.exitCode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
