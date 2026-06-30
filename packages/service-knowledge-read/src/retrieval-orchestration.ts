import type { RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import type { RecallExecutionResult } from '@trapmap/server/lib/retrieval/orchestration/recall-coordinator.js';
import type { RecallCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

export interface RecallChannel {
  readonly name: string;
  recall(queryText: string, entries: KnowledgeRecord[]): Promise<RecallCandidate[]>;
}

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

export interface RetrievalStrategy {
  readonly version: string;
  execute(
    query: RetrievalQuery,
    channels: ChannelRegistry,
    eligibleEntries: KnowledgeRecord[],
    services?: SkillShareerServices,
    auth?: ResolvedAuthContext,
  ): Promise<RecallExecutionResult>;
}

export class StrategyRegistry {
  private readonly strategies = new Map<string, RetrievalStrategy>();

  register(strategy: RetrievalStrategy): void {
    this.strategies.set(strategy.version, strategy);
  }

  get(version: string): RetrievalStrategy | undefined {
    return this.strategies.get(version);
  }

  all(): RetrievalStrategy[] {
    return Array.from(this.strategies.values());
  }
}
