import type { RetrievalQueryPort } from '@trapmap/backend-core';
import type {
  ArtifactReadProjection,
  ConflictRelation,
  KnowledgeOwnerPort,
  RetrievalGovernanceProjection,
  RetrievalQuery,
} from '@trapmap/contracts';
import type {
  KnowledgeReadAiServices,
  KnowledgeReadGraphQueryBackend,
  KnowledgeReadGraphQueryRuntimeState,
  KnowledgeReadRetrievalInfra,
  KnowledgeReadStoreSeam,
  ResolvedAuthContext,
  SkillShareerRepos,
} from './context.js';
import { createDefaultKnowledgeReadRetrievalInfra } from './retrieval-infra-default.js';
import { keywordChannel } from './retrieval-keyword.js';
import {
  ChannelRegistry,
  type RetrievalStrategy,
  StrategyRegistry,
} from './retrieval-orchestration.js';
import {
  graphAssistedHybridRecall,
  hybridRecall,
  semanticRecall,
} from './retrieval-recall-coordinator.js';
import { semanticChannel } from './retrieval-semantic.js';
import { searchKnowledge } from './search-knowledge.js';
import type { FeedbackQueueRecord } from './store.js';

type SearchKnowledgeServices = Parameters<typeof searchKnowledge>[0];
type SearchKnowledgeAuth = Parameters<typeof searchKnowledge>[1];

export interface KnowledgeReadRetrievalQueryOptions {
  services: SearchKnowledgeServices;
  resolveAuthContext(params: { teamId?: string }): SearchKnowledgeAuth;
  mode?: RetrievalQuery['mode'];
}

export interface KnowledgeReadOwnerRetrievalServicesOptions {
  config: SearchKnowledgeServices['config'];
  knowledge: Pick<KnowledgeOwnerPort, 'getById' | 'listByFilter' | 'updateEmbeddingCache'>;
  artifact: Pick<ArtifactReadProjection, 'listByFilter' | 'listForRetrieval'>;
  governance: RetrievalGovernanceProjection<FeedbackQueueRecord, ConflictRelation>;
  strategyRegistry: SearchKnowledgeServices['strategyRegistry'];
  channelRegistry: SearchKnowledgeServices['channelRegistry'];
  ai: KnowledgeReadAiServices;
  store: KnowledgeReadStoreSeam;
  graphQuery: KnowledgeReadGraphQueryRuntimeState;
  graphQueryBackend?: KnowledgeReadGraphQueryBackend;
  retrievalInfra?: KnowledgeReadRetrievalInfra;
}

export function createKnowledgeReadOwnerRetrievalServices(
  options: KnowledgeReadOwnerRetrievalServicesOptions,
): SearchKnowledgeServices {
  const repos: SkillShareerRepos = {
    knowledge: options.knowledge as unknown as SkillShareerRepos['knowledge'], // lib type gap: the owner
    // port returns contracts KnowledgeEntry records while the retrieval pipeline
    // consumes the internal KnowledgeRecord shape — the same runtime projection rows
    artifact: options.artifact as unknown as SkillShareerRepos['artifact'], // lib type gap: the owner
    // port returns contracts artifact records while the retrieval pipeline consumes
    // the internal SkillArtifactRecord shape — same runtime rows
    governanceRetrievalProjection: options.governance,
    usageAnalytics: null,
    graphIndex: null,
  };

  return {
    config: options.config,
    repos,
    strategyRegistry: options.strategyRegistry,
    channelRegistry: options.channelRegistry,
    ai: options.ai,
    store: options.store,
    graphQuery: options.graphQuery,
    ...(options.graphQueryBackend ? { graphQueryBackend: options.graphQueryBackend } : {}),
    ...(options.retrievalInfra ? { retrievalInfra: options.retrievalInfra } : {}),
  };
}

export function createKnowledgeReadRetrievalInfra(): KnowledgeReadRetrievalInfra {
  return createDefaultKnowledgeReadRetrievalInfra();
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
      return graphAssistedHybridRecall(query.seed, eligibleEntries, query, services);
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
        filters: {
          labels: [],
          scopes: ['global', 'project'],
          ...(params.teamId ? { teamId: params.teamId } : {}),
        },
        includeRefinement: false,
        includeSummary: false,
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
        channel: result.routingTrace?.channelsUsed.join(',') ?? 'semantic',
      };
    },
  };
}
