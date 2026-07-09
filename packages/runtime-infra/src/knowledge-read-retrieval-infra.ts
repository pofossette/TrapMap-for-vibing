import type { Pool } from 'pg';

import {
  getCachedQueryEmbedding,
  setCachedQueryEmbedding,
} from '@trapmap/server/lib/cache/query-embedding-cache.js';
import { enrichMatchesWithConflicts } from '@trapmap/server/lib/conflict/index.js';
import { DEFAULT_FRESHNESS_CONFIG } from '@trapmap/server/lib/decay/index.js';
import { generateEmbedding, hashEmbeddingText } from '@trapmap/server/lib/embeddings.js';
import {
  selectRetrievalStrategy,
  toRoutingTrace,
} from '@trapmap/server/lib/retrieval/orchestration/index.js';
import { vectorSimilaritySearch } from '@trapmap/server/lib/retrieval/recall/db-search.js';
import { graphAssistedRecall } from '@trapmap/server/lib/retrieval/recall/graph-assisted.js';
import { createPgKeywordRecall } from '@trapmap/server/lib/retrieval/recall/pg-keyword.js';
import {
  buildBoundaryExplanation,
  computeBoundaryScoreDelta,
  createSemanticCandidate,
  filterByBoundary,
  mergeCandidates,
  rerankCandidates,
  toScoredEntriesFromReranked,
} from '@trapmap/server/lib/retrieval/scoring/index.js';

export interface RuntimeInfraKnowledgeReadStoreSeam {
  getPool?(): Pool | null | undefined;
}

export interface RuntimeInfraKnowledgeReadRetrievalInfra {
  embeddings: {
    generate: typeof generateEmbedding;
    hashText: typeof hashEmbeddingText;
    getCachedQuery: typeof getCachedQueryEmbedding;
    setCachedQuery: typeof setCachedQueryEmbedding;
  };
  routing: {
    selectStrategy: typeof selectRetrievalStrategy;
    toRoutingTrace: typeof toRoutingTrace;
  };
  conflicts: {
    enrichMatches: typeof enrichMatchesWithConflicts;
  };
  scoring: {
    freshnessConfig: typeof DEFAULT_FRESHNESS_CONFIG;
    computeBoundaryScoreDelta: typeof computeBoundaryScoreDelta;
    buildBoundaryExplanation: typeof buildBoundaryExplanation;
    filterByBoundary: typeof filterByBoundary;
    createSemanticCandidate: typeof createSemanticCandidate;
    mergeCandidates: typeof mergeCandidates;
    rerankCandidates: typeof rerankCandidates;
    toScoredEntriesFromReranked: typeof toScoredEntriesFromReranked;
  };
  pgRecall: {
    isEnabled(): boolean;
    getPool(store: RuntimeInfraKnowledgeReadStoreSeam): Pool | null;
    vectorSimilaritySearch: typeof vectorSimilaritySearch;
    keywordRecall(
      pool: Pool,
      queryText: string,
      filters: unknown,
      maxResults: number,
    ): Promise<unknown[]>;
    graphAssistedRecall: typeof graphAssistedRecall;
  };
}

export function createDefaultKnowledgeReadRetrievalInfra(): RuntimeInfraKnowledgeReadRetrievalInfra {
  return {
    embeddings: {
      generate: generateEmbedding,
      hashText: hashEmbeddingText,
      getCachedQuery: getCachedQueryEmbedding,
      setCachedQuery: setCachedQueryEmbedding,
    },
    routing: {
      selectStrategy: selectRetrievalStrategy,
      toRoutingTrace,
    },
    conflicts: {
      enrichMatches: enrichMatchesWithConflicts,
    },
    scoring: {
      freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
      computeBoundaryScoreDelta,
      buildBoundaryExplanation,
      filterByBoundary,
      createSemanticCandidate,
      mergeCandidates,
      rerankCandidates,
      toScoredEntriesFromReranked,
    },
    pgRecall: {
      isEnabled: () => process.env.USE_DB_SEARCH === 'true',
      getPool(store: RuntimeInfraKnowledgeReadStoreSeam) {
        return typeof store.getPool === 'function' ? (store.getPool() ?? null) : null;
      },
      vectorSimilaritySearch,
      async keywordRecall(pool: Pool, queryText: string, filters: unknown, maxResults: number) {
        const pgKeywordRecall = createPgKeywordRecall({
          pool,
          featureFlag: () => true,
        });
        return pgKeywordRecall(queryText, filters as never, maxResults);
      },
      graphAssistedRecall,
    },
  };
}
