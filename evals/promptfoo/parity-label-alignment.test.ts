/**
 * label-alignment --runner promptfoo parity test.
 *
 * Proves that `--runner promptfoo` (SuiteBridge execution engine) matches the
 * native runner per-case under dry-run, comparing metrics including
 * recallReasonDistribution. Results are keyed by `caseId` because promptfoo may
 * reorder results.
 */

import { describe, expect, it } from 'vitest';

import {
  evaluateLabelAlignmentCaseDryRun,
  loadLabelAlignmentFixtures,
} from '../label-alignment/core.js';
import { labelAlignmentBridge } from '../label-alignment/bridge.js';
import { runSuiteWithPromptfoo } from './runner.js';
import type { SuiteRunOptions } from './types.js';

describe('label-alignment --runner promptfoo parity (dry-run)', () => {
  it('matches native per-case under dry-run', async () => {
    const cases = (await loadLabelAlignmentFixtures({ tier: 'smoke' })).flatMap((fixture) =>
      fixture.cases.filter((case_) => case_.tier === 'smoke'),
    );
    const native = cases.map((case_) => ({
      ...evaluateLabelAlignmentCaseDryRun(case_),
      mode: 'dry-run',
      durationMs: 0,
    }));

    const opts: SuiteRunOptions = {
      tier: 'smoke',
      dryRun: true,
      allowEmpty: false,
      runner: 'promptfoo',
      mode: 'dry-run',
    };
    const pf = await runSuiteWithPromptfoo(labelAlignmentBridge, opts);

    expect(pf.caseCount).toBe(native.length);
    // The assertion mapping (GradingResult pass) drives `pf.passed`; exercise it
    // directly rather than only the verbatim-rebuilt case results.
    expect(pf.passed).toBe(native.every((result) => result.passed));

    const nativeByCaseId = new Map(native.map((result) => [result.caseId, result]));
    for (const pfCase of pf.report.cases) {
      const nativeCase = nativeByCaseId.get(pfCase.caseId);
      expect(nativeCase).toBeDefined();
      expect(pfCase.passed).toBe(nativeCase!.passed);
      expect(pfCase.missedMerges).toBe(nativeCase!.missedMerges);
      expect(pfCase.falseMerges).toBe(nativeCase!.falseMerges);
      expect(pfCase.alignmentAccuracy).toBe(nativeCase!.alignmentAccuracy);
      expect(pfCase.synonymEliminationCount).toBe(nativeCase!.synonymEliminationCount);
      expect(pfCase.synonymEliminationRate).toBe(nativeCase!.synonymEliminationRate);
      expect(pfCase.recallReasonDistribution).toEqual(nativeCase!.recallReasonDistribution);
    }
  });
});
