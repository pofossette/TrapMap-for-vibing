/**
 * Pluggable retrieval strategy registry.
 *
 * Each retrieval strategy implements a retrieval pipeline version (v1 semantic,
 * v1 hybrid, v1 graph-assisted, etc.). The StrategyRegistry stores strategies
 * keyed by version string.
 *
 * Strategies with the same version overwrite the previous registration (Map.set behavior),
 * allowing hot-replacement during development.
 */

import type { RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import type { ChannelRegistry } from './channel-registry.js';
import type { RecallExecutionResult } from './recall-coordinator.js';

/**
 * Pluggable retrieval strategy interface.
 * Each strategy implements a retrieval pipeline version (v1 semantic, v1 hybrid, v1 graph-assisted, etc.).
 */
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

/**
 * Registry for retrieval strategies.
 * Strategies are keyed by version string.
 * Re-registering the same version overwrites the previous strategy (Map.set behavior).
 */
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
