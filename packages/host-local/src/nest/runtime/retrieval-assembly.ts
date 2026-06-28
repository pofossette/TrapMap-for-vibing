import { keywordChannel } from '@trapmap/server/lib/retrieval/recall/keyword.js';
import { semanticChannel } from '@trapmap/server/lib/retrieval/recall/semantic.js';
import { ChannelRegistry } from '@trapmap/server/lib/retrieval/orchestration/channel-registry.js';
import {
  graphAssistedRecall,
  hybridRecall,
  semanticRecall,
} from '@trapmap/server/lib/retrieval/orchestration/recall-coordinator.js';
import {
  StrategyRegistry,
  type RetrievalStrategy,
} from '@trapmap/server/lib/retrieval/orchestration/strategy-registry.js';

// Host-owned retrieval assembly for the default light runtime. Retrieval
// primitives are still borrowed from server as a shared implementation seam.
export function createHostLocalChannelRegistry(): ChannelRegistry {
  const registry = new ChannelRegistry();
  registry.register(semanticChannel);
  registry.register(keywordChannel);
  return registry;
}

export function createHostLocalStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry();
  const semanticStrategy: RetrievalStrategy = {
    version: 'semantic',
    async execute(query, _channels, eligibleEntries, services, auth) {
      return semanticRecall(query.seed, eligibleEntries, query, services, auth);
    },
  };
  const hybridStrategy: RetrievalStrategy = {
    version: 'hybrid',
    async execute(query, _channels, eligibleEntries, services, auth) {
      return hybridRecall(query.seed, eligibleEntries, query, services, auth);
    },
  };
  const graphAssistedStrategy: RetrievalStrategy = {
    version: 'graph-assisted',
    async execute(query, _channels, eligibleEntries, services) {
      return graphAssistedRecall(query.seed, eligibleEntries, query, services);
    },
  };
  registry.register(semanticStrategy);
  registry.register(hybridStrategy);
  registry.register(graphAssistedStrategy);
  return registry;
}

export type HostLocalChannelRegistry = ReturnType<typeof createHostLocalChannelRegistry>;
export type HostLocalStrategyRegistry = ReturnType<typeof createHostLocalStrategyRegistry>;
