/**
 * promptfoo provider factories.
 *
 * Every suite bridge turns "execute one contract case" into a promptfoo
 * provider function. The provider returns the structured execution result in
 * `raw.result` (carried with the case in `raw.case`) so the suite's javascript
 * assertion and `mapResult` can reuse the TrapMap scoring functions without
 * re-deriving state. `output` is a display string only.
 */

import type { CallApiContextParams, ProviderFunction, ProviderResponse } from 'promptfoo';

/** Structured per-case execution produced by a suite bridge. */
export interface CaseExecution {
  /** Structured execution data handed to the assertion and mapResult. */
  result: unknown;
  /** Human-readable output string (for promptfoo display). */
  output?: unknown;
  latencyMs?: number;
}

/** Executes one contract case; may throw to signal a failed case. */
export type CaseExecutor = (
  case_: unknown,
  context: CallApiContextParams | undefined,
) => CaseExecution | Promise<CaseExecution>;

const CASE_VAR = '__case';

function readCaseFromVars(context: CallApiContextParams | undefined): unknown {
  const raw = context?.vars?.[CASE_VAR];
  if (typeof raw !== 'string') {
    throw new Error(`promptfoo provider missing '${CASE_VAR}' var`);
  }
  return JSON.parse(raw);
}

function toDisplay(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output === undefined) return '';
  return JSON.stringify(output);
}

/**
 * Core wrapper: convert a per-case executor into a promptfoo provider function.
 * Any executor error becomes a failed ProviderResponse (assertion then grades
 * the error as a non-pass).
 */
export function createCaseProvider(execute: CaseExecutor): ProviderFunction {
  return async (_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> => {
    const start = Date.now();
    let case_: unknown;
    try {
      case_ = readCaseFromVars(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error: message,
        raw: { case: null, result: { error: message } },
        latencyMs: Date.now() - start,
      };
    }

    try {
      const execution = await execute(case_, context);
      return {
        output: toDisplay(execution.output),
        raw: { case: case_, result: execution.result },
        latencyMs: execution.latencyMs ?? Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error: message,
        raw: { case: case_, result: { error: message } },
        latencyMs: Date.now() - start,
      };
    }
  };
}

/**
 * LLM-backed provider: wraps a per-case ChatProvider call
 * (agent-planning, graph-extraction live).
 */
export function llmProvider(execute: CaseExecutor): ProviderFunction {
  return createCaseProvider(execute);
}

/**
 * Composed-server provider: wraps retrieval adapters seed→execute→close
 * (retrieval, summary, label-alignment live). The executor owns the
 * create/close lifecycle; the factory guarantees an error still produces a
 * structured (failed) response.
 */
export function composedProvider(execute: CaseExecutor): ProviderFunction {
  return createCaseProvider(execute);
}

/**
 * Deterministic provider: wraps a pure function with no external side effects
 * (ingestion, label-alignment dry-run, graph-extraction dry-run).
 */
export function deterministicProvider(execute: CaseExecutor): ProviderFunction {
  return createCaseProvider(execute);
}
