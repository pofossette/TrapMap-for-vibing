/**
 * Dry-run helpers.
 *
 * For suites that do not execute in dry-run (retrieval, summary) the runner
 * short-circuits via `buildDryRunResult`. For suites that DO execute in
 * dry-run (fallback/deterministic), the bridge builds an echo provider that
 * carries the canned dry-run execution result.
 */

import type { ProviderFunction } from 'promptfoo';

/** Echo provider: returns a fixed structured result without executing the suite. */
export function createEchoProvider(result: unknown): ProviderFunction {
  return async () => ({
    output: typeof result === 'string' ? result : JSON.stringify(result ?? null),
    raw: { result },
    latencyMs: 0,
  });
}
