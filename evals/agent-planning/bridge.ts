/**
 * agent-planning SuiteBridge — reference implementation for the promptfoo
 * migration.
 *
 * The provider executor runs the full native case pipeline (actor → normalize
 * → deterministic precheck → judge) and carries the precomputed
 * `AgentPlanningCaseResult` on `raw.result`. The assertion maps that result to
 * a promptfoo `GradingResult`; `mapResult` returns the precomputed result
 * verbatim. This keeps `--runner promptfoo` byte-identical to native under the
 * deterministic fallback provider without re-deriving scoring state (promptfoo
 * does not propagate `GradingResult.metadata`).
 */

import type {
  AgentPlanningCaseResult,
  AgentPlanningEvalCase,
  AgentPlanningEvalReport,
  AgentPlanningEvalTier,
} from '@trapmap/contracts/evals';

import { createJsAssertion } from '../promptfoo/assertion.js';
import { registerBridge } from '../promptfoo/bridge.js';
import { llmProvider } from '../promptfoo/provider.js';
import { assertResultPresent } from '../promptfoo/result.js';
import type { SuiteBridge, SuiteRunOptions } from '../promptfoo/types.js';
import { type AgentPlanningReportOptions, buildAgentPlanningReport } from './lib/report.js';
import { getAgentPlanningEvaluationCases } from './lib/runner-api.js';
import { type AgentPlanningResolvedOptions, executeCase, loadScenario } from './run.js';

function resolveOptions(options: SuiteRunOptions): AgentPlanningResolvedOptions {
  return {
    tier: options.tier as AgentPlanningEvalTier,
    dryRun: options.dryRun,
    provider: (options.provider as 'fallback' | 'openai') ?? 'fallback',
    promptTemplateId: (options.promptTemplateId as string) ?? 'default-agent-planning',
    runner: 'promptfoo',
    ...(options.promptTemplatePath !== undefined
      ? { promptTemplatePath: options.promptTemplatePath as string }
      : {}),
  };
}

export const agentPlanningBridge: SuiteBridge<
  AgentPlanningEvalCase,
  AgentPlanningCaseResult,
  AgentPlanningEvalReport
> = {
  suiteId: 'agent-planning',
  // Native dry-run still executes the deterministic fallback, so no
  // buildDryRunResult short-circuit.
  dryRunMode: 'execute',

  loadCases(options) {
    return getAgentPlanningEvaluationCases(options.tier as AgentPlanningEvalTier);
  },

  buildProvider(options) {
    const resolved = resolveOptions(options);
    return llmProvider(async (case_) => {
      const caseDefinition = case_ as AgentPlanningEvalCase;
      const scenario = loadScenario(resolved.tier, caseDefinition.scenarioId);
      const start = Date.now();
      const result = await executeCase(caseDefinition, scenario, resolved);
      return { result, output: result.actorOutput, latencyMs: Date.now() - start };
    });
  },

  buildAssertions() {
    return [
      createJsAssertion<AgentPlanningEvalCase, AgentPlanningCaseResult>((_case, result) => {
        if (
          !result ||
          typeof result !== 'object' ||
          !('passed' in result) ||
          !('totalScore' in result)
        ) {
          return { pass: false, score: 0, reason: 'execution failed', namedScores: {} };
        }
        return {
          pass: result.passed,
          score: result.totalScore,
          reason: result.judge?.summary ?? 'agent-planning judgment',
          namedScores: {
            total: result.totalScore,
            path: result.pathScore,
            finalAnswer: result.finalAnswerScore,
          },
        };
      }),
    ];
  },

  mapResult(_options, evalResult) {
    return assertResultPresent<AgentPlanningCaseResult>(evalResult);
  },

  buildReport(options, results) {
    const reportOptions: AgentPlanningReportOptions = {
      tier: options.tier as AgentPlanningEvalTier,
      dryRun: options.dryRun,
      provider: (options.provider as 'fallback' | 'openai') ?? 'fallback',
      promptTemplateId: (options.promptTemplateId as string) ?? 'default-agent-planning',
    };
    return buildAgentPlanningReport(
      results,
      reportOptions,
      results.reduce((sum, result) => sum + result.durationMs, 0),
    );
  },

  concurrency() {
    return 4;
  },
};

registerBridge(agentPlanningBridge);
