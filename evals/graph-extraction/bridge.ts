/**
 * graph-extraction SuiteBridge for the promptfoo migration.
 *
 * The provider executor runs the full native per-case pipeline
 * (`evaluateCase` over `performLLMExtraction`) and carries the precomputed
 * `CaseMetrics` on `raw.result`. The assertion maps those metrics to a
 * promptfoo `GradingResult`; `mapResult` returns them verbatim with an
 * error-guard. This keeps `--runner promptfoo` byte-identical to native under
 * dry-run (unavailable mode) and any deterministic extraction path without
 * re-deriving scoring state.
 */

import type { GraphExtractionFixture } from './fixtures.js';
import { getSmokeFixtures, graphExtractionFixtures } from './fixtures.js';
import type { AggregateMetrics, CaseMetrics } from './lib/case-eval.js';
import { aggregateMetrics, evaluateCase } from './lib/case-eval.js';

import { createJsAssertion } from '../promptfoo/assertion.js';
import { registerBridge } from '../promptfoo/bridge.js';
import { llmProvider } from '../promptfoo/provider.js';
import { assertResultPresent } from '../promptfoo/result.js';
import type { SuiteBridge } from '../promptfoo/types.js';

export interface GraphExtractionBridgeReport {
  totalFixtures: number;
  results: CaseMetrics[];
  aggregate: AggregateMetrics;
}

export const graphExtractionBridge: SuiteBridge<
  GraphExtractionFixture,
  CaseMetrics,
  GraphExtractionBridgeReport
> = {
  suiteId: 'graph-extraction',
  // Native dry-run still executes the deterministic fallback (unavailable
  // mode), so no buildDryRunResult short-circuit.
  dryRunMode: 'execute',

  loadCases(options) {
    return options.tier === 'smoke' ? getSmokeFixtures() : graphExtractionFixtures;
  },

  buildProvider(options) {
    return llmProvider(async (case_) => {
      const fixture = case_ as GraphExtractionFixture;
      const start = Date.now();
      const metrics = await evaluateCase(fixture, options.dryRun);
      return {
        result: metrics,
        output: JSON.stringify(metrics),
        latencyMs: Date.now() - start,
      };
    });
  },

  buildAssertions() {
    return [
      createJsAssertion<GraphExtractionFixture, CaseMetrics>((_case, metrics) => {
        if (
          !metrics ||
          typeof metrics !== 'object' ||
          !('mode' in metrics) ||
          !('nodeMetrics' in metrics)
        ) {
          return { pass: false, score: 0, reason: 'execution failed', namedScores: {} };
        }
        return {
          pass: metrics.mode === 'live',
          score: metrics.nodeMetrics.f1,
          reason: metrics.warning ?? `mode=${metrics.mode}`,
          namedScores: {
            nodeF1: metrics.nodeMetrics.f1,
            edgeF1: metrics.edgeMetrics.f1,
            strengthAccuracy: metrics.strengthAccuracy,
          },
        };
      }),
    ];
  },

  mapResult(_options, evalResult) {
    return assertResultPresent<CaseMetrics>(evalResult);
  },

  buildReport(_options, results) {
    return {
      totalFixtures: results.length,
      results,
      aggregate: aggregateMetrics(results),
    };
  },

  concurrency() {
    return 4;
  },
};

registerBridge(graphExtractionBridge);
