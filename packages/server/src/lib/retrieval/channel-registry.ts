/**
 * Pluggable recall channel registry.
 *
 * Each recall channel implements a single recall strategy (semantic, keyword, graph, etc.).
 * The ChannelRegistry stores channels keyed by name and returns them in registration order.
 *
 * Implementations must output scores normalized to [0, 1].
 */

import type { KnowledgeRecord } from '../store.js';
import type { RecallCandidate } from './types.js';

/**
 * Pluggable recall channel interface.
 * Each channel implements a single recall strategy (semantic, keyword, graph, etc.).
 * Implementations must output scores normalized to [0, 1].
 */
export interface RecallChannel {
  readonly name: string;
  recall(queryText: string, entries: KnowledgeRecord[]): Promise<RecallCandidate[]>;
}

/**
 * Registry for recall channels.
 * Channels are keyed by name and returned in registration order.
 * Duplicate registration throws to catch startup misconfiguration.
 */
export class ChannelRegistry {
  private readonly channels = new Map<string, RecallChannel>();

  register(channel: RecallChannel): void {
    if (this.channels.has(channel.name)) {
      throw new Error(`Channel '${channel.name}' is already registered`);
    }
    this.channels.set(channel.name, channel);
  }

  get(name: string): RecallChannel | undefined {
    return this.channels.get(name);
  }

  all(): RecallChannel[] {
    return Array.from(this.channels.values());
  }
}
