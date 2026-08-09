/**
 * Shared promptfoo bridge contracts.
 *
 * A `SuiteBridge` adapts one eval suite to the promptfoo execution engine:
 * contract case → provider call → scoring (reusing TrapMap pure functions)
 * → contract report backfill. promptfoo only schedules/concurrents the
 * provider + assertion work; all semantics live in the bridge.
 */

import type { Assertion, ProviderFunction } from 'promptfoo';

import type { SuiteEvalResult } from './result.js';

export type EvalTier = 'smoke' | 'core';

export interface SuiteRunOptions {
  tier: EvalTier;
  dryRun: boolean;
  allowEmpty: boolean;
  runner: 'native' | 'promptfoo';
  /** Suite-specific options carried opaquely (endpoint, mode, provider, ...). */
  [key: string]: unknown;
}

/**
 * Native dry-run semantics differ per suite:
 * - `skip`: native dry-run loads/validates cases then returns without executing
 *   (retrieval, summary). The bridge must supply `buildDryRunResult`.
 * - `execute`: native dry-run still runs a fallback/deterministic execution
 *   (agent-planning, graph-extraction, ingestion, label-alignment).
 */
export type DryRunMode = 'skip' | 'execute';

export interface SuiteBridge<TCase, TCaseResult, TReport> {
  suiteId: string;
  /** Load and validate cases, applying tier / endpoint / metadata filters. */
  loadCases(options: SuiteRunOptions): TCase[] | Promise<TCase[]>;
  /** Build the promptfoo provider (llm / composed / deterministic / echo). */
  buildProvider(options: SuiteRunOptions): ProviderFunction;
  /** Build promptfoo javascript assertions reusing the suite's scoring functions. */
  buildAssertions(options: SuiteRunOptions): Assertion[];
  /** Map a promptfoo result back to the contract CaseResult. */
  mapResult(options: SuiteRunOptions, evalResult: SuiteEvalResult): TCaseResult;
  /** Build the contract report from per-case results. */
  buildReport(options: SuiteRunOptions, results: TCaseResult[]): TReport;
  /** promptfoo maxConcurrency (1 for suites sharing a TRUNCATE database). */
  concurrency(options: SuiteRunOptions): number;
  dryRunMode: DryRunMode;
  /** For `skip` dry-run: produce the native-equivalent dry-run report. */
  buildDryRunResult?(options: SuiteRunOptions, cases: TCase[]): TReport;
}
