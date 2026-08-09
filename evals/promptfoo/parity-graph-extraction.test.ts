/**
 * graph-extraction --runner promptfoo parity test.
 *
 * Proves that `--runner promptfoo` (SuiteBridge execution engine) matches the
 * native runner per-case under dry-run. Native dry-run always produces the
 * deterministic "unavailable" mode, so results are compared keyed by `caseId`
 * because promptfoo may reorder results.
 */

import { describe, expect, it } from 'vitest';

import { evaluateCase } from '../graph-extraction/run.js';
import { getSmokeFixtures } from '../graph-extraction/fixtures.js';
import { graphExtractionBridge } from '../graph-extraction/bridge.js';
import { runSuiteWithPromptfoo } from './runner.js';
import type { SuiteRunOptions } from './types.js';

describe('graph-extraction --runner promptfoo parity (dry-run)', () => {
  it('matches native per-case under dry-run', async () => {
    const native: Awaited<ReturnType<typeof evaluateCase>>[] = [];
    for (const fixture of getSmokeFixtures()) {
      native.push(await evaluateCase(fixture, true));
    }

    const opts: SuiteRunOptions = {
      tier: 'smoke',
      dryRun: true,
      allowEmpty: false,
      runner: 'promptfoo',
    };
    const pf = await runSuiteWithPromptfoo(graphExtractionBridge, opts);

    expect(pf.caseCount).toBe(native.length);
    expect(pf.report.totalFixtures).toBe(native.length);

    const nativeByCaseId = new Map(native.map((result) => [result.caseId, result]));
    for (const pfCase of pf.report.results) {
      const nativeCase = nativeByCaseId.get(pfCase.caseId);
      expect(nativeCase).toBeDefined();
      expect(pfCase.mode).toBe(nativeCase!.mode);
      expect(pfCase.warning).toBe(nativeCase!.warning);
      expect(pfCase.degraded).toBe(nativeCase!.degraded);
      expect(pfCase.nodeMetrics).toEqual(nativeCase!.nodeMetrics);
      expect(pfCase.edgeMetrics).toEqual(nativeCase!.edgeMetrics);
      expect(pfCase.strengthAccuracy).toBe(nativeCase!.strengthAccuracy);
      expect(pfCase.totalExpectedStrengths).toBe(nativeCase!.totalExpectedStrengths);
    }
  });
});
