/**
 * Run a suite through the promptfoo execution engine.
 *
 * promptfoo is loaded lazily via dynamic `import()` so native-only call paths
 * never pay for its dependency graph. `evaluate()` handles provider scheduling,
 * concurrency and assertion grading; the bridge's `mapResult`/`buildReport`
 * rebuild the contract report from the results.
 */

import type { SuiteBridge, SuiteRunOptions } from './types.js';

export interface PromptfooRunResult<TReport> {
  report: TReport;
  passed: boolean;
  caseCount: number;
}

const EVAL_PROMPT = 'eval';

export async function runSuiteWithPromptfoo<TCase, TCaseResult, TReport>(
  bridge: SuiteBridge<TCase, TCaseResult, TReport>,
  options: SuiteRunOptions,
): Promise<PromptfooRunResult<TReport>> {
  const cases = await bridge.loadCases(options);

  if (cases.length === 0) {
    if (options.allowEmpty) {
      return {
        report: await bridge.buildReport(options, []),
        passed: true,
        caseCount: 0,
      };
    }
    throw new Error(
      `No cases found for suite '${bridge.suiteId}' tier '${options.tier}'. Use allowEmpty to skip.`,
    );
  }

  if (options.dryRun && bridge.dryRunMode === 'skip') {
    if (!bridge.buildDryRunResult) {
      throw new Error(`Suite '${bridge.suiteId}' is missing buildDryRunResult`);
    }
    const report = bridge.buildDryRunResult(options, cases);
    return { report, passed: true, caseCount: cases.length };
  }

  const { evaluate } = await import('promptfoo');
  const provider = bridge.buildProvider(options);
  const assertions = bridge.buildAssertions(options);

  const tests = cases.map((case_) => ({
    vars: { __case: JSON.stringify(case_) },
    assert: assertions,
  }));

  const evalRecord = await evaluate(
    {
      prompts: [EVAL_PROMPT],
      providers: [provider],
      tests,
      writeLatestResults: false,
    },
    {
      cache: false,
      maxConcurrency: bridge.concurrency(options),
      silent: true,
    },
  );

  const caseResults = evalRecord.results.map((result) => bridge.mapResult(options, result));
  const report = await bridge.buildReport(options, caseResults);

  return {
    report,
    passed: evalRecord.results.every((result) => result.success),
    caseCount: caseResults.length,
  };
}
