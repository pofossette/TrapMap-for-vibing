/**
 * summary --runner promptfoo parity test.
 *
 * The summary execution drives the retrieval adapters, which require a real
 * PostgreSQL host in production. Following the existing summary test pattern,
 * this test mocks the adapters so the parity of the bridge plumbing is verified
 * deterministically and DB-free: both native `executeSummaryCase` and the
 * bridge run the identical mocked execution, and the per-case judge results
 * (groundedness/coverage/verdicts) must match.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the retrieval adapters before importing the modules that use them.
vi.mock('../retrieval/lib/adapters.js', () => ({
  closeExecutionContext: vi.fn().mockResolvedValue(undefined),
  createActorSession: vi.fn().mockResolvedValue(undefined),
  createExecutionContext: vi.fn().mockResolvedValue({}),
  executeThroughRoute: vi.fn().mockResolvedValue({
    result: {
      rawResponse: {
        summary: {
          text: 'Docker container startup healthcheck timeout is fixed by increasing the healthcheck interval.',
        },
        capsules: [
          { content: 'Docker healthcheck', problem: 'startup timeout', goal: 'detect timeout' },
        ],
      },
    },
  }),
  seedScenarioFixtures: vi.fn().mockResolvedValue(undefined),
}));

import { executeSummaryCase } from '../summary/lib/execute-case.js';
import { getSummaryEvaluationCases } from '../summary/lib/runner-api.js';
import type { SummaryCaseResult } from '../summary/lib/types.js';
import { summaryBridge } from '../summary/bridge.js';
import { runSuiteWithPromptfoo } from './runner.js';
import type { SuiteRunOptions } from './types.js';

describe('summary --runner promptfoo parity (fallback judge)', () => {
  it('matches native per-case under the fallback judge', async () => {
    const cases = getSummaryEvaluationCases('smoke');
    const native: SummaryCaseResult[] = [];
    for (const case_ of cases) {
      native.push(await executeSummaryCase(case_, { provider: 'fallback' }));
    }

    const opts: SuiteRunOptions = {
      tier: 'smoke',
      dryRun: false,
      allowEmpty: false,
      runner: 'promptfoo',
      provider: 'fallback',
    };
    const pf = await runSuiteWithPromptfoo(summaryBridge, opts);

    expect(pf.caseCount).toBe(native.length);
    // The assertion mapping drives `pf.passed`; exercise it directly.
    expect(pf.passed).toBe(native.every((r) => r.passed));

    const nativeByCaseId = new Map(native.map((r) => [r.case.caseId, r]));
    for (const pfCase of pf.report.cases) {
      const nativeCase = nativeByCaseId.get(pfCase.caseId);
      expect(nativeCase).toBeDefined();
      expect(pfCase.passed).toBe(nativeCase!.passed);
      expect(pfCase.groundednessScore).toBe(nativeCase!.judgeResult.groundednessScore);
      expect(pfCase.coverageScore).toBe(nativeCase!.judgeResult.coverageScore);
      expect(pfCase.requiredFactsCovered).toEqual(nativeCase!.judgeResult.requiredFactsCovered);
      expect(pfCase.requiredFactsMissing).toEqual(nativeCase!.judgeResult.requiredFactsMissing);
      expect(pfCase.forbiddenClaimsFound).toEqual(nativeCase!.judgeResult.forbiddenClaimsFound);
      expect(pfCase.claimsSupported).toBe(
        nativeCase!.judgeResult.claims.filter((c) => c.supported).length,
      );
    }
  });
});
