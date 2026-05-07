/**
 * Adapter registry for the indexing pipeline.
 *
 * Provides dynamic registration of IndexAdapter implementations by string kind,
 * replacing the hardcoded adapter array pattern. New adapters can be registered
 * at startup without modifying pipeline or type code.
 *
 * Map preserves insertion order (ECMAScript spec), so adapter execution order
 * matches registration order — preserving the sequential pipeline semantics.
 */

import type { IndexAdapter } from './types.js';

export class AdapterRegistry {
  private readonly adapters = new Map<string, IndexAdapter>();

  /**
   * Register an adapter. Throws if an adapter with the same kind is already registered.
   */
  register(adapter: IndexAdapter): void {
    if (this.adapters.has(adapter.kind)) {
      throw new Error(`Adapter '${adapter.kind}' is already registered`);
    }
    this.adapters.set(adapter.kind, adapter);
  }

  /**
   * Get an adapter by kind, or undefined if not registered.
   */
  get(kind: string): IndexAdapter | undefined {
    return this.adapters.get(kind);
  }

  /**
   * Return all registered adapters in insertion order.
   */
  all(): IndexAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Return all registered kind strings in insertion order.
   */
  kinds(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check whether an adapter with the given kind is registered.
   */
  has(kind: string): boolean {
    return this.adapters.has(kind);
  }
}
