/**
 * Simple round-robin instance selector.
 *
 * Cycles through healthy instances per service name.  Maintains a
 * per-service index so successive calls return different instances.
 */

import type { DiscoveredService } from '../ports/discovery-ports.js';

export class RoundRobinSelector {
  /** Service name -> last returned index. */
  private readonly indices = new Map<string, number>();

  /**
   * Return the next instance for `serviceName` from the supplied list.
   *
   * Instances whose `id` appears in `unhealthyIds` are skipped.
   * Returns `undefined` when no usable instances remain.
   */
  select(
    serviceName: string,
    instances: DiscoveredService[],
    unhealthyIds?: Set<string>,
  ): DiscoveredService | undefined {
    const usable = unhealthyIds ? instances.filter((i) => !unhealthyIds.has(i.id)) : instances;

    if (usable.length === 0) return undefined;
    if (usable.length === 1) return usable[0];

    const current = this.indices.get(serviceName) ?? 0;
    const idx = current % usable.length;
    this.indices.set(serviceName, idx + 1);
    return usable[idx];
  }
}
