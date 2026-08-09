/**
 * Pipeline test for the promptfoo execution substrate.
 *
 * Verifies `runSuiteWithPromptfoo` drives loadCases → evaluate → mapResult →
 * buildReport end-to-end with a deterministic echo provider, and that the
 * dry-run `skip` short-circuit mirrors the native semantics.
 */

import { describe, expect, it } from 'vitest';

import { createJsAssertion } from './assertion.js';
import { deterministicProvider } from './provider.js';
import { extractOutcome } from './result.js';
import { runSuiteWithPromptfoo } from './runner.js';
import type { SuiteBridge, SuiteRunOptions } from './types.js';

interface FakeCase {
  id: string;
  value: number;
}

interface FakeCaseResult {
  caseId: string;
  doubled: number;
  passed: boolean;
  latencyMs: number;
}

interface FakeReport {
  schemaVersion: 1;
  total: number;
  passed: number;
  results: FakeCaseResult[];
}

function makeBridge(
  dryRunMode: 'skip' | 'execute',
): SuiteBridge<FakeCase, FakeCaseResult, FakeReport> {
  const cases: FakeCase[] = [
    { id: 'a', value: 2 },
    { id: 'b', value: 0 },
  ];

  return {
    suiteId: 'fake',
    dryRunMode,
    loadCases() {
      return cases;
    },
    buildProvider() {
      return deterministicProvider((case_) => {
        const c = case_ as FakeCase;
        return { result: { doubled: c.value * 2 } };
      });
    },
    buildAssertions() {
      return [
        createJsAssertion<FakeCase, { doubled: number }>((case_, result) => ({
          pass: result.doubled > 0 && result.doubled === case_.value * 2,
          score: result.doubled > 0 ? 1 : 0,
          reason: 'deterministic double',
          namedScores: { doubled: result.doubled },
        })),
      ];
    },
    mapResult(_options, evalResult) {
      const { case: case_, result, success, latencyMs } = extractOutcome<FakeCase>(evalResult);
      const c = case_ as FakeCase;
      return {
        caseId: c.id,
        doubled: (result as { doubled: number }).doubled,
        passed: success,
        latencyMs,
      };
    },
    buildReport(_options, results) {
      return {
        schemaVersion: 1 as const,
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        results,
      };
    },
    concurrency() {
      return 2;
    },
    ...(dryRunMode === 'skip'
      ? {
          buildDryRunResult(_options: SuiteRunOptions, loaded: FakeCase[]) {
            return {
              schemaVersion: 1 as const,
              total: loaded.length,
              passed: loaded.length,
              results: [],
            };
          },
        }
      : {}),
  };
}

const baseOptions: SuiteRunOptions = {
  tier: 'smoke',
  dryRun: false,
  allowEmpty: false,
  runner: 'promptfoo',
};

describe('runSuiteWithPromptfoo', () => {
  it('drives loadCases → evaluate → mapResult → buildReport for every case', async () => {
    const bridge = makeBridge('execute');
    const result = await runSuiteWithPromptfoo(bridge, { ...baseOptions, tier: 'core' });

    expect(result.caseCount).toBe(2);
    expect(result.report.total).toBe(2);
    expect(result.report.passed).toBe(1);
    expect(result.passed).toBe(false);

    const byId = new Map(result.report.results.map((r) => [r.caseId, r]));
    expect(byId.get('a')).toMatchObject({ doubled: 4, passed: true });
    expect(byId.get('b')).toMatchObject({ doubled: 0, passed: false });
  });

  it('short-circuits via buildDryRunResult in dry-run skip mode', async () => {
    const bridge = makeBridge('skip');
    const result = await runSuiteWithPromptfoo(bridge, { ...baseOptions, dryRun: true });

    expect(result.report.total).toBe(2);
    expect(result.report.passed).toBe(2);
    expect(result.report.results).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it('throws when no cases and allowEmpty is false', async () => {
    const bridge: SuiteBridge<FakeCase, FakeCaseResult, FakeReport> = {
      ...makeBridge('execute'),
      loadCases() {
        return [];
      },
    };
    await expect(runSuiteWithPromptfoo(bridge, baseOptions)).rejects.toThrow(/No cases found/);
  });

  it('returns an empty report when no cases and allowEmpty is true', async () => {
    const bridge: SuiteBridge<FakeCase, FakeCaseResult, FakeReport> = {
      ...makeBridge('execute'),
      loadCases() {
        return [];
      },
    };
    const result = await runSuiteWithPromptfoo(bridge, { ...baseOptions, allowEmpty: true });
    expect(result.report.total).toBe(0);
    expect(result.passed).toBe(true);
  });
});
