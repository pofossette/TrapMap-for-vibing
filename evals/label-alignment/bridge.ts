/**
 * label-alignment SuiteBridge for the promptfoo migration.
 *
 * The provider executor runs the full native per-case pipeline — for dry-run
 * `evaluateLabelAlignmentCaseDryRun` (`runDeterministicRecall` →
 * `inferRecallReason` → `calculateCaseMetrics`), for live
 * `runLiveDecisionEvaluation` — and carries the precomputed
 * `LabelAlignmentEvalCaseResult` on `raw.result`. The assertion maps that result
 * to a promptfoo `GradingResult`; `mapResult` returns it verbatim with an
 * error-guard. This keeps `--runner promptfoo` per-case identical to native
 * without re-deriving scoring state.
 */

import type {
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
  LabelAlignmentEvalReport,
} from '@trapmap/contracts/evals';

import { createJsAssertion } from '../promptfoo/assertion.js';
import { registerBridge } from '../promptfoo/bridge.js';
import { composedProvider, deterministicProvider } from '../promptfoo/provider.js';
import { assertResultPresent } from '../promptfoo/result.js';
import type { SuiteBridge, SuiteRunOptions } from '../promptfoo/types.js';
import { evaluateLabelAlignmentCaseDryRun, loadLabelAlignmentFixtures } from './core.js';
import { type LiveDecisionContext, runLiveDecisionEvaluation } from './lib/decision-eval.js';
import { buildLabelAlignmentReport } from './lib/report.js';

export const labelAlignmentBridge: SuiteBridge<
  LabelAlignmentEvalCase,
  LabelAlignmentEvalCaseResult,
  LabelAlignmentEvalReport
> = {
  suiteId: 'label-alignment',
  // Native dry-run still executes the deterministic recall pipeline, so no
  // buildDryRunResult short-circuit.
  dryRunMode: 'execute',

  async loadCases(options) {
    const fixtures = await loadLabelAlignmentFixtures({ tier: options.tier as 'smoke' | 'core' });
    return fixtures.flatMap((fixture) =>
      fixture.cases.filter((case_) => case_.tier === options.tier),
    );
  },

  buildProvider(options) {
    if (options.mode === 'live') {
      return composedProvider(async (case_) => {
        const c = case_ as LabelAlignmentEvalCase;
        const start = Date.now();
        const liveResult = await runLiveDecisionEvaluation(
          c,
          (options.live as LiveDecisionContext | undefined) ?? {},
        );
        return {
          result: { ...liveResult, mode: 'live' as const, durationMs: Date.now() - start },
          output: c.caseId,
        };
      });
    }
    return deterministicProvider(async (case_) => {
      const c = case_ as LabelAlignmentEvalCase;
      const start = Date.now();
      const dryResult = evaluateLabelAlignmentCaseDryRun(c);
      return {
        result: { ...dryResult, mode: 'dry-run' as const, durationMs: Date.now() - start },
        output: c.caseId,
      };
    });
  },

  buildAssertions() {
    return [
      createJsAssertion<LabelAlignmentEvalCase, LabelAlignmentEvalCaseResult>((_case, result) => {
        if (!result || typeof result !== 'object' || !('passed' in result)) {
          return { pass: false, score: 0, reason: 'execution failed', namedScores: {} };
        }
        return {
          pass: result.passed,
          score: result.alignmentAccuracy,
          reason: result.passed ? 'alignment passed' : 'alignment failed',
          namedScores: {
            alignmentAccuracy: result.alignmentAccuracy,
            missedMerges: result.missedMerges,
            falseMerges: result.falseMerges,
          },
        };
      }),
    ];
  },

  mapResult(_options, evalResult) {
    return assertResultPresent<LabelAlignmentEvalCaseResult>(evalResult);
  },

  async buildReport(options, results) {
    const tier = options.tier as 'smoke' | 'core';
    const mode = (options.mode as 'dry-run' | 'live') ?? 'dry-run';
    const allFixtures = await loadLabelAlignmentFixtures({ tier });
    const fixtureIds = allFixtures
      .filter((fixture) => {
        const ids = options.fixtureIds as string[] | undefined;
        return !ids?.length || ids.includes(fixture.fixtureId);
      })
      .map((fixture) => fixture.fixtureId);
    return buildLabelAlignmentReport({
      tier,
      mode,
      fixtureIds,
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
      cases: results,
    });
  },

  concurrency() {
    return 1;
  },
};

registerBridge(labelAlignmentBridge);
