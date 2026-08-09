/**
 * agent-planning --runner promptfoo parity test.
 *
 * Proves that `--runner promptfoo` (SuiteBridge execution engine) matches the
 * native runner per-case under the deterministic fallback provider, for both
 * dry-run and live. Results are compared keyed by `taskId::variantId` because
 * promptfoo may reorder results.
 */

import { describe, expect, it } from 'vitest';

import { agentPlanningBridge } from '../agent-planning/bridge.js';
import { getAgentPlanningEvaluationCases } from '../agent-planning/lib/runner-api.js';
import { executeCase, loadScenario } from '../agent-planning/run.js';
import { runSuiteWithPromptfoo } from './runner.js';
import type { SuiteRunOptions } from './types.js';

describe('agent-planning --runner promptfoo parity (fallback provider)', () => {
  for (const dryRun of [false, true] as const) {
    it(`matches native per-case for dryRun=${dryRun}`, async () => {
      const nativeResults: Awaited<ReturnType<typeof executeCase>>[] = [];
      for (const case_ of getAgentPlanningEvaluationCases('smoke')) {
        const scenario = loadScenario('smoke', case_.scenarioId);
        nativeResults.push(
          await executeCase(case_, scenario, {
            tier: 'smoke',
            dryRun,
            provider: 'fallback',
            promptTemplateId: 'default-agent-planning',
            runner: 'native',
          }),
        );
      }

      const opts: SuiteRunOptions = {
        tier: 'smoke',
        dryRun,
        allowEmpty: false,
        runner: 'promptfoo',
        provider: 'fallback',
        promptTemplateId: 'default-agent-planning',
      };
      const pf = await runSuiteWithPromptfoo(agentPlanningBridge, opts);

      expect(pf.caseCount).toBe(nativeResults.length);
      expect(pf.report.summary.totalCases).toBe(nativeResults.length);

      const nativeByKey = new Map(
        nativeResults.map((result) => [`${result.taskId}::${result.variantId}`, result]),
      );
      for (const pfCase of pf.report.cases) {
        const native = nativeByKey.get(`${pfCase.taskId}::${pfCase.variantId}`);
        expect(native).toBeDefined();
        expect(pfCase.passed).toBe(native!.passed);
        expect(pfCase.totalScore).toBe(native!.totalScore);
        expect(pfCase.dimensionScores).toEqual(native!.dimensionScores);
        expect(pfCase.actorOutput).toBe(native!.actorOutput);
      }

      expect(pf.report.summary.passedCases).toBe(
        pf.report.cases.filter((case_) => case_.passed).length,
      );
    });
  }
});
