/**
 * Generic promptfoo javascript-assertion wrapper.
 *
 * A suite bridge grades each case with its own pure functions and returns a
 * promptfoo `GradingResult { pass, score, reason, namedScores }`. The wrapper
 * hands the grader the parsed contract case (from `vars.__case`) and the
 * structured execution result (from `providerResponse.raw.result`).
 */

import type { Assertion, AssertionValueFunctionContext, GradingResult } from 'promptfoo';

export type CaseGrader<TCase = unknown, TResult = unknown> = (
  case_: TCase,
  result: TResult,
  context: AssertionValueFunctionContext,
) => GradingResult | Promise<GradingResult>;

const CASE_VAR = '__case';

/** Wrap a suite grader as a promptfoo `javascript` assertion. */
export function createJsAssertion<TCase, TResult>(grade: CaseGrader<TCase, TResult>): Assertion {
  return {
    type: 'javascript',
    value: async (_output: string, context: AssertionValueFunctionContext) => {
      const rawVar = context.vars[CASE_VAR];
      const case_ = (typeof rawVar === 'string' ? JSON.parse(rawVar) : undefined) as TCase;
      const result = (context.providerResponse as { raw?: { result?: unknown } } | undefined)?.raw
        ?.result as TResult;
      return grade(case_, result, context);
    },
  };
}
