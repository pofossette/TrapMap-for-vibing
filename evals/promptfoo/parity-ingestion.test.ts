/**
 * ingestion --runner promptfoo parity test.
 *
 * Proves that `--runner promptfoo` (SuiteBridge execution engine) matches the
 * native runner per-case under dry-run, comparing passed/capsule count and the
 * full per-field `DerivationAssertions` record (逐字段对比). Results are keyed
 * by `fixtureId` because promptfoo may reorder results.
 */

import { describe, expect, it } from 'vitest';

import { getSmokeFixtures } from '../ingestion/fixtures/index.js';
import {
  buildDerivationContext,
  bundleToPayloads,
  makeDeterministicId,
} from '../ingestion/adapter.js';
import type { DerivedOutput, DerivationAssertions } from '../ingestion/assertions.js';
import { runAssertions } from '../ingestion/assertions.js';
import { ingestionBridge } from '../ingestion/bridge.js';
import { runSuiteWithPromptfoo } from './runner.js';
import type { SuiteRunOptions } from './types.js';

interface NativeIngestionResult {
  fixtureId: string;
  passed: boolean;
  assertions: DerivationAssertions;
  capsuleCount: number;
}

describe('ingestion --runner promptfoo parity (dry-run)', () => {
  it('matches native per-case under dry-run', async () => {
    const { deriveFromPayloads } = await import(
      '../../packages/service-knowledge-write/src/artifact-derive-from-payloads.js'
    );

    const native: NativeIngestionResult[] = [];
    for (const fixture of getSmokeFixtures()) {
      const artifactId = makeDeterministicId(fixture.bundle.slug);
      const payloads = bundleToPayloads(fixture.bundle, artifactId);
      const context = buildDerivationContext(fixture.bundle, artifactId);
      const output = (await deriveFromPayloads(payloads, context)) as DerivedOutput;
      const assertion = runAssertions(fixture.id, fixture.bundle, output);
      native.push({
        fixtureId: assertion.fixtureId,
        passed: assertion.passed,
        assertions: assertion.assertions,
        capsuleCount: output.capsules.length,
      });
    }

    const opts: SuiteRunOptions = {
      tier: 'smoke',
      dryRun: true,
      allowEmpty: false,
      runner: 'promptfoo',
    };
    const pf = await runSuiteWithPromptfoo(ingestionBridge, opts);

    expect(pf.caseCount).toBe(native.length);
    // Smoke fixtures all pass derivation assertions; exercise the assertion
    // mapping via `pf.passed` rather than only the verbatim-rebuilt results.
    expect(pf.passed).toBe(true);

    const nativeByFixtureId = new Map(native.map((result) => [result.fixtureId, result]));
    for (const pfCase of pf.report.results) {
      const nativeCase = nativeByFixtureId.get(pfCase.fixtureId);
      expect(nativeCase).toBeDefined();
      expect(pfCase.passed).toBe(nativeCase!.passed);
      expect(pfCase.capsuleCount).toBe(nativeCase!.capsuleCount);
      expect(pfCase.assertions).toEqual(nativeCase!.assertions);
    }

    expect(pf.report.passedBundles).toBe(pf.report.results.filter((r) => r.passed).length);
  });
});
