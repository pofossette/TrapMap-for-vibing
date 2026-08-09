/**
 * Suite bridge registry.
 *
 * Each suite registers its `SuiteBridge` here so `eval-all.ts` (Phase 7) can
 * iterate the six suites uniformly instead of branching per suite.
 */

import type { SuiteBridge } from './types.js';

const registry = new Map<string, SuiteBridge<unknown, unknown, unknown>>();

export function registerBridge<TCase, TCaseResult, TReport>(
  bridge: SuiteBridge<TCase, TCaseResult, TReport>,
): void {
  registry.set(bridge.suiteId, bridge as SuiteBridge<unknown, unknown, unknown>);
}

export function getBridge(suiteId: string): SuiteBridge<unknown, unknown, unknown> | undefined {
  return registry.get(suiteId);
}

export function listBridgeIds(): string[] {
  return [...registry.keys()];
}
