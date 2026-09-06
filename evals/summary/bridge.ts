/**
 * summary SuiteBridge for the promptfoo migration.
 *
 * The provider executor runs the full native per-case pipeline
 * (`executeSummaryCase`: retrieval adapters create/seed/actor-session/
 * execute/close → judge → verdicts) and carries the precomputed
 * `SummaryCaseResult` on `raw.result`. The assertion maps that result to a
 * promptfoo `GradingResult`; `mapResult` returns it verbatim with an
 * error-guard. Native summary dry-run short-circuits without executing, so
 * `dryRunMode` is `skip` and `buildDryRunResult` returns an empty report.
 */

import { createJsAssertion } from '../promptfoo/assertion.js';
import { registerBridge } from '../promptfoo/bridge.js';
import { composedProvider } from '../promptfoo/provider.js';
import { assertResultPresent } from '../promptfoo/result.js';
import type { SuiteBridge, SuiteRunOptions } from '../promptfoo/types.js';
import type {
  SummaryEvalCase,
  SummaryEvalEndpoint,
  SummaryEvalReport,
  SummaryEvalTier,
} from '../types/index.js';
import { executeSummaryCase } from './lib/execute-case.js';
import { buildSummaryReport } from './lib/report.js';
import { getSummaryEvaluationCases } from './lib/runner-api.js';
import type { JudgeProvider, RunnerOptions, SummaryCaseResult } from './lib/types.js';

function toRunnerOptions(options: SuiteRunOptions): RunnerOptions {
  return {
    tier: options.tier as SummaryEvalTier,
    json: false,
    allowEmpty: options.allowEmpty,
    dryRun: options.dryRun,
    verbose: (options.verbose as number) ?? 0,
    llmProvider: (options.provider as JudgeProvider) ?? 'fallback',
    ...(options.endpoint !== undefined
      ? { endpoint: options.endpoint as SummaryEvalEndpoint }
      : {}),
  };
}

export const summaryBridge: SuiteBridge<SummaryEvalCase, SummaryCaseResult, SummaryEvalReport> = {
  suiteId: 'summary',
  // Native summary dry-run loads/validates cases then returns without executing.
  dryRunMode: 'skip',

  loadCases(options) {
    return getSummaryEvaluationCases(
      options.tier as SummaryEvalTier,
      options.endpoint as SummaryEvalEndpoint | undefined,
    );
  },

  buildProvider(options) {
    return composedProvider(async (case_) => {
      const c = case_ as SummaryEvalCase;
      const start = Date.now();
      const result = await executeSummaryCase(c, {
        provider: (options.provider as JudgeProvider) ?? 'fallback',
        verbose: (options.verbose as number) ?? 0,
      });
      return { result, output: c.caseId, latencyMs: Date.now() - start };
    });
  },

  buildAssertions() {
    return [
      createJsAssertion<SummaryEvalCase, SummaryCaseResult>((_case, result) => {
        if (!result || typeof result !== 'object' || !('passed' in result)) {
          return { pass: false, score: 0, reason: 'execution failed', namedScores: {} };
        }
        const groundedness = result.judgeResult?.groundednessScore ?? 0;
        const coverage = result.judgeResult?.coverageScore ?? 0;
        return {
          pass: result.passed,
          score: (groundedness + coverage) / 2,
          reason: result.passed ? 'summary passed' : 'summary failed',
          namedScores: { groundedness, coverage },
        };
      }),
    ];
  },

  mapResult(_options, evalResult) {
    return assertResultPresent<SummaryCaseResult>(evalResult);
  },

  buildDryRunResult(options) {
    return buildSummaryReport({
      caseResults: [],
      options: toRunnerOptions(options),
      durationMs: 0,
      llmProvider: (options.provider as JudgeProvider) ?? 'fallback',
    });
  },

  buildReport(options, results) {
    return buildSummaryReport({
      caseResults: results,
      options: toRunnerOptions(options),
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      llmProvider: (options.provider as JudgeProvider) ?? 'fallback',
    });
  },

  concurrency() {
    return 1;
  },
};

registerBridge(summaryBridge);
