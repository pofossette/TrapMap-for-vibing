import type { RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import type { RecallExecutionResult } from './retrieval-recall-coordinator.js';
import type { RecallCandidate } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

export interface KnowledgeReadRecallChannel {
  readonly name: string;
  recall(queryText: string, entries: KnowledgeRecord[]): Promise<RecallCandidate[]>;
}

export class ChannelRegistry {
  private readonly channels = new Map<string, KnowledgeReadRecallChannel>();

  // fallow-ignore-next-line unused-class-member -- registry pattern; register() is called by server-retrieval-seam createKnowledgeReadChannelRegistry
  register(channel: KnowledgeReadRecallChannel): void {
    if (this.channels.has(channel.name)) {
      throw new Error(`Channel '${channel.name}' is already registered`);
    }
    this.channels.set(channel.name, channel);
  }

  // fallow-ignore-next-line unused-class-member -- registry pattern; get() satisfies ChannelRegistryLike structural contract consumed by dispatchByMode in retrieval-recall-coordinator
  get(name: string): KnowledgeReadRecallChannel | undefined {
    return this.channels.get(name);
  }

  // fallow-ignore-next-line unused-class-member -- registry pattern; all() satisfies ChannelRegistryLike structural contract consumed by dispatchByMode in retrieval-recall-coordinator
  all(): KnowledgeReadRecallChannel[] {
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
