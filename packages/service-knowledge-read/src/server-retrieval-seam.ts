import type { ResolvedAuthContext, RetrievalQueryPort } from '@trapmap/backend-core';
import type { RetrievalQuery } from '@trapmap/contracts';
import { keywordChannel } from './retrieval-keyword.js';
import {
  graphAssistedRecall,
  hybridRecall,
  semanticRecall,
} from './retrieval-recall-coordinator.js';
import {
  ChannelRegistry,
  type RetrievalStrategy,
  StrategyRegistry,
} from './retrieval-orchestration.js';
import { searchKnowledge } from './search-knowledge.js';
import { semanticChannel } from './retrieval-semantic.js';

type SearchKnowledgeServices = Parameters<typeof searchKnowledge>[0];
type SearchKnowledgeAuth = Parameters<typeof searchKnowledge>[1];

export interface KnowledgeReadRetrievalQueryOptions {
  services: SearchKnowledgeServices;
  resolveAuthContext(params: { teamId?: string }): SearchKnowledgeAuth;
  mode?: RetrievalQuery['mode'];
}

export function createKnowledgeReadChannelRegistry(): ChannelRegistry {
  const registry = new ChannelRegistry();
  registry.register(semanticChannel);
  registry.register(keywordChannel);
  return registry;
}

export function createKnowledgeReadStrategyRegistry(): StrategyRegistry {
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

export function createKnowledgeReadRetrievalQuery(
  options: KnowledgeReadRetrievalQueryOptions,
): RetrievalQueryPort {
  return {
    async search(params) {
      const auth = options.resolveAuthContext(params) as ResolvedAuthContext;
      const result = await searchKnowledge(options.services, auth, {
        seed: params.query,
        mode: options.mode ?? 'hybrid',
        maxResults: params.limit ?? 10,
      });

      const rows = [...result.globalConstraints, ...result.projectKnowledge];
      return {
        results: rows.map((row) => ({
          entryId: row.entryId,
          score: row.score,
          snippet: row.detail,
        })),
        totalEstimate: rows.length,
        channel: result.routingTrace.channelsUsed.join(','),
      };
    },
  };
}
