/**
 * promptfoo EvaluationResult → contract CaseResult helpers.
 *
 * The provider carries `{ case, result }` on `ProviderResponse.raw`, so
 * `mapResult` can rebuild the contract case result without re-deriving state.
 */

/** Structural view of a promptfoo result row, decoupled from promptfoo's class. */
export interface SuiteEvalResult {
  success: boolean;
  score: number;
  namedScores: Record<string, number>;
  latencyMs: number;
  error?: string | null;
  gradingResult?: { reason?: string; pass?: boolean; score?: number } | null;
  response: { raw?: { case?: unknown; result?: unknown } } | null | undefined;
}

export interface EvaluationOutcomeView<TCase> {
  case: TCase;
  result: unknown;
  success: boolean;
  score: number | null;
  namedScores: Record<string, number>;
  reason: string;
  latencyMs: number;
  error: string | null;
}

/** Normalized view of a promptfoo result for a suite's `mapResult`. */
export function extractOutcome<TCase = unknown>(
  evalResult: SuiteEvalResult,
): EvaluationOutcomeView<TCase> {
  const raw = evalResult.response?.raw;
  return {
    case: (raw?.case ?? {}) as TCase,
    result: raw?.result,
    success: evalResult.success,
    score: evalResult.score,
    namedScores: evalResult.namedScores ?? {},
    reason: evalResult.gradingResult?.reason ?? evalResult.error ?? '',
    latencyMs: evalResult.latencyMs,
    error: evalResult.error ?? null,
  };
}

/**
 * Extract the precomputed case result, surfacing a provider executor error as
 * the underlying message.
 *
 * promptfoo sets `evalResult.error` to the assertion failure reason, so a
 * non-passing assertion is NOT an execution failure. Only the provider error
 * path (`raw.result = { error }`, set by createCaseProvider on an executor
 * throw) or a missing result signals a real failure worth surfacing.
 */
export function assertResultPresent<TResult>(evalResult: SuiteEvalResult): TResult {
  const { error, result } = extractOutcome(evalResult);
  const rawError = (result as { error?: unknown } | null | undefined)?.error;
  if (typeof rawError === 'string') {
    throw new Error(rawError);
  }
  if (result == null) {
    throw new Error(error || 'execution produced no result');
  }
  return result as TResult;
}
