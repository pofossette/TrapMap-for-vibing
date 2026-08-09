/**
 * retrieval SuiteBridge for the promptfoo migration.
 *
 * The provider executor runs the full native per-case pipeline
 * (`executeRetrievalCase`: isolated context create/seed/execute/close →
 * governance → metrics → graph-plan structure → outcome match) and carries the
 * precomputed `CaseResult` on `raw.result`. The assertion maps that result to a
 * promptfoo `GradingResult` with hitAt1/mrr/ndcg named scores; `mapResult`
 * returns it verbatim with an error-guard. Native retrieval dry-run
 * short-circuits without executing, so `dryRunMode` is `skip`.
 */

import type {
  RetrievalEvalCase,
  RetrievalEvalEndpoint,
  RetrievalEvalTier,
} from '@trapmap/contracts/evals';

import { createJsAssertion } from '../promptfoo/assertion.js';
import { registerBridge } from '../promptfoo/bridge.js';
import { composedProvider } from '../promptfoo/provider.js';
import { assertResultPresent } from '../promptfoo/result.js';
import type { SuiteBridge, SuiteRunOptions } from '../promptfoo/types.js';
import { executeRetrievalCase } from './lib/execute-case.js';
import type { RunRetrievalOptions } from './lib/runner-api.js';
import { getRetrievalEvaluationCases } from './lib/runner-api.js';
import { buildRunnerSummary } from './lib/runner-summary.js';
import type { CaseResult, RunnerSummary } from './lib/types.js';

function toRunnerOptions(options: SuiteRunOptions): RunnerSummary['options'] {
  return {
    tier: options.tier as RetrievalEvalTier,
    json: (options.json as boolean) ?? false,
    allowEmpty: options.allowEmpty,
    dryRun: options.dryRun,
    verbose: (options.verbose as number) ?? 0,
    ...(options.endpoint !== undefined
      ? { endpoint: options.endpoint as RetrievalEvalEndpoint }
      : {}),
    ...(options.jsonPath !== undefined ? { jsonPath: options.jsonPath as string } : {}),
    ...(options.baselinePath !== undefined ? { baselinePath: options.baselinePath as string } : {}),
    ...(options.writeBaseline !== undefined
      ? { writeBaseline: options.writeBaseline as boolean }
      : {}),
  };
}

export const retrievalBridge: SuiteBridge<RetrievalEvalCase, CaseResult, RunnerSummary> = {
  suiteId: 'retrieval',
  // Native retrieval dry-run loads/validates cases then returns without executing.
  dryRunMode: 'skip',

  loadCases(options) {
    return getRetrievalEvaluationCases(
      options.tier as RetrievalEvalTier,
      options.endpoint as RunRetrievalOptions['endpoint'] | undefined,
    );
  },

  buildProvider(_options) {
    return composedProvider(async (case_) => {
      const c = case_ as RetrievalEvalCase;
      const start = Date.now();
      const result = await executeRetrievalCase(c);
      return { result, output: c.caseId, latencyMs: Date.now() - start };
    });
  },

  buildAssertions() {
    return [
      createJsAssertion<RetrievalEvalCase, CaseResult>((_case, result) => {
        if (!result || typeof result !== 'object' || !('passed' in result)) {
          return { pass: false, score: 0, reason: 'execution failed', namedScores: {} };
        }
        return {
          pass: result.passed,
          score: (result.metrics.hitAt1 + result.metrics.mrr + result.metrics.ndcg) / 3,
          reason: result.passed ? 'retrieval passed' : 'retrieval failed',
          namedScores: {
            hitAt1: result.metrics.hitAt1,
            mrr: result.metrics.mrr,
            ndcg: result.metrics.ndcg,
          },
        };
      }),
    ];
  },

  mapResult(_options, evalResult) {
    return assertResultPresent<CaseResult>(evalResult);
  },

  buildDryRunResult(options) {
    return buildRunnerSummary([], toRunnerOptions(options), 0);
  },

  buildReport(options, results) {
    return buildRunnerSummary(
      results,
      toRunnerOptions(options),
      results.reduce((sum, r) => sum + r.execution.durationMs, 0),
    );
  },

  concurrency() {
    return 1;
  },
};

registerBridge(retrievalBridge);
