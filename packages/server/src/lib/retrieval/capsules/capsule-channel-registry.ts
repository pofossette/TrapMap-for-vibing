import type { CapsuleRecallChannel, CapsuleRecallChannelName } from '../types.js';
import { capsuleHeuristicChannel } from './channels/heuristic.js';

/**
 * Registry for capsule recall channels.
 *
 * Each channel implements a single recall strategy (heuristic, keyword, semantic, graph).
 * Channels are keyed by name and returned in registration order.
 * Duplicate registration throws to catch startup misconfiguration.
 */
export class CapsuleChannelRegistry {
  private readonly channels = new Map<string, CapsuleRecallChannel>();

  /**
   * Register a capsule recall channel.
   * Throws if a channel with the same name is already registered.
   */
  register(channel: CapsuleRecallChannel): void {
    if (this.channels.has(channel.name)) {
      throw new Error(`Capsule recall channel '${channel.name}' is already registered`);
    }
    this.channels.set(channel.name, channel);
  }

  /**
   * Get a channel by name.
   * Returns undefined if the channel is not registered.
   */
  get(name: CapsuleRecallChannelName | string): CapsuleRecallChannel | undefined {
    return this.channels.get(name);
  }

  /**
   * Get all registered channels in registration order.
   */
  all(): CapsuleRecallChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Remove a channel by name.
   * No-op if the channel is not registered.
   */
  unregister(name: CapsuleRecallChannelName | string): void {
    this.channels.delete(name);
  }
}

/**
 * Create a CapsuleChannelRegistry with the default heuristic channel pre-registered.
 * This provides the backward-compatible Phase 1 configuration.
 */
export function createDefaultCapsuleChannelRegistry(): CapsuleChannelRegistry {
  const registry = new CapsuleChannelRegistry();
  registry.register(capsuleHeuristicChannel);
  return registry;
}
