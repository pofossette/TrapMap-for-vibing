import type { Pool } from 'pg';

import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/index.js';
import type {
  CapsuleRecallChannel,
  CapsuleRecallChannelName,
} from '@trapmap/server/lib/retrieval/types.js';
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
function createDefaultCapsuleChannelRegistry(): CapsuleChannelRegistry {
  const registry = new CapsuleChannelRegistry();
  registry.register(capsuleHeuristicChannel);
  return registry;
}

/**
 * Options for building a full capsule channel registry.
 */
export interface FullCapsuleChannelRegistryOptions {
  /** PG pool for keyword and semantic channels (null = memory-only fallback) */
  pgPool?: Pool | null;
  /** PG feature flag for keyword channel */
  pgKeywordFlag?: () => boolean;
  /** PG feature flag for semantic channel */
  pgSemanticFlag?: () => boolean;
  /** Graph query backend for graph channel */
  graphQueryBackend?: GraphQueryBackend;
}

/**
 * Create a CapsuleChannelRegistry with all default channels:
 * heuristic, keyword, semantic, and graph (if backend available).
 *
 * This is the shared factory used by both the retrieval orchestrator
 * and the skill-lookup convergence path.
 */
export async function createFullCapsuleChannelRegistry(
  options: FullCapsuleChannelRegistryOptions = {},
): Promise<CapsuleChannelRegistry> {
  const registry = createDefaultCapsuleChannelRegistry();

  const { createCapsuleKeywordChannel } = await import('./channels/keyword.js');
  const { createCapsuleSemanticChannel } = await import('./channels/semantic.js');

  registry.register(
    createCapsuleKeywordChannel(
      options.pgPool
        ? {
            pgPool: options.pgPool,
            pgFeatureFlag: options.pgKeywordFlag ?? (() => false),
          }
        : undefined,
    ),
  );

  registry.register(
    createCapsuleSemanticChannel(
      options.pgPool
        ? {
            pgPool: options.pgPool,
            pgFeatureFlag: options.pgSemanticFlag ?? (() => false),
          }
        : undefined,
    ),
  );

  // Graph channel registration is optional and failure-tolerant
  if (options.graphQueryBackend) {
    try {
      const { createCapsuleGraphChannel } = await import('./channels/graph.js');
      registry.register(createCapsuleGraphChannel(options.graphQueryBackend));
    } catch {
      // Graph channel registration failure should not block retrieval
    }
  }

  return registry;
}
