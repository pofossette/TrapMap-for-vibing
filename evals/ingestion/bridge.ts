/**
 * ingestion SuiteBridge for the promptfoo migration.
 *
 * The provider executor runs the full native per-case pipeline
 * (`bundleToPayloads` → `deriveFromPayloads` → `runAssertions`) and carries the
 * precomputed `IngestionCaseResult` on `raw.result`. The assertion maps that
 * result to a promptfoo `GradingResult`; `mapResult` returns it verbatim with
 * an error-guard. This keeps `--runner promptfoo` byte-identical to native
 * without re-deriving assertion state.
 */

import {
  buildDerivationContext,
  bundleToPayloads,
  loadDownloadedBundles,
  makeDeterministicId,
} from './adapter.js';
import type { DerivationAssertions, DerivedOutput } from './assertions.js';
import { runAssertions } from './assertions.js';
import type { DerivationFixture } from './fixtures/index.js';
import { derivationFixtures, getSmokeFixtures } from './fixtures/index.js';
import type { DerivationAggregateMetrics } from './metrics.js';
import { aggregateMetrics } from './metrics.js';

import { failedExecutionAssertion } from '../lib/assertion.js';
import { createJsAssertion } from '../promptfoo/assertion.js';
import { registerBridge } from '../promptfoo/bridge.js';
import { deterministicProvider } from '../promptfoo/provider.js';
import { assertResultPresent } from '../promptfoo/result.js';
import type { SuiteBridge } from '../promptfoo/types.js';

export interface IngestionCaseResult {
  fixtureId: string;
  title: string;
  assertions: DerivationAssertions;
  passed: boolean;
  capsuleCount: number;
}

export interface IngestionBridgeReport {
  totalBundles: number;
  passedBundles: number;
  failedBundles: number;
  passRate: number;
  aggregate: DerivationAggregateMetrics;
  results: IngestionCaseResult[];
}

export const ingestionBridge: SuiteBridge<
  DerivationFixture,
  IngestionCaseResult,
  IngestionBridgeReport
> = {
  suiteId: 'ingestion',
  // Native dry-run still executes the deterministic derivation pipeline, so no
  // buildDryRunResult short-circuit.
  dryRunMode: 'execute',

  loadCases(options) {
    // Mirror native: dry-run uses bundled fixtures, live uses downloaded
    // bundles (throws with the same clear error when the data file is absent).
    if (options.dryRun) {
      return options.tier === 'smoke' ? getSmokeFixtures() : derivationFixtures;
    }
    const downloaded = loadDownloadedBundles();
    const subset = options.tier === 'smoke' ? downloaded.slice(0, 5) : downloaded;
    return subset.map((bundle) => ({ id: bundle.slug, bundle }));
  },

  buildProvider(_options) {
    return deterministicProvider(async (case_) => {
      const fixture = case_ as DerivationFixture;
      const { deriveFromPayloads } = await import(
        '../../packages/service-knowledge-write/src/artifact-derive-from-payloads.js'
      );
      const artifactId = makeDeterministicId(fixture.bundle.slug);
      const payloads = bundleToPayloads(fixture.bundle, artifactId);
      const context = buildDerivationContext(fixture.bundle, artifactId);
      const output = (await deriveFromPayloads(payloads, context)) as DerivedOutput;
      const assertion = runAssertions(fixture.id, fixture.bundle, output);
      return {
        result: {
          fixtureId: assertion.fixtureId,
          title: assertion.title,
          assertions: assertion.assertions,
          passed: assertion.passed,
          capsuleCount: output.capsules.length,
        },
        output: `${assertion.fixtureId}: ${output.capsules.length} capsule(s), passed=${assertion.passed}`,
      };
    });
  },

  buildAssertions() {
    return [
      createJsAssertion<DerivationFixture, IngestionCaseResult>((_case, result) => {
        if (!result || typeof result !== 'object' || !('passed' in result)) {
          return failedExecutionAssertion();
        }
        return {
          pass: result.passed,
          score: result.passed ? 1 : 0,
          reason: result.passed
            ? 'all derivation assertions passed'
            : 'some derivation assertions failed',
          namedScores: { capsuleCount: result.capsuleCount },
        };
      }),
    ];
  },

  mapResult(_options, evalResult) {
    return assertResultPresent<IngestionCaseResult>(evalResult);
  },

  buildReport(_options, results) {
    const assertionResults = results.map((r) => ({
      fixtureId: r.fixtureId,
      title: r.title,
      assertions: r.assertions,
      passed: r.passed,
    }));
    const aggregate = aggregateMetrics(
      assertionResults,
      results.map((r) => r.capsuleCount),
    );
    return {
      totalBundles: aggregate.totalBundles,
      passedBundles: aggregate.passedBundles,
      failedBundles: aggregate.failedBundles,
      passRate: aggregate.passRate,
      aggregate,
      results,
    };
  },

  concurrency() {
    return 4;
  },
};

registerBridge(ingestionBridge);
