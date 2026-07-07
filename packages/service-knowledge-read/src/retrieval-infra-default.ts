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
  mergeCandidates,
  rerankCandidates,
  toScoredEntriesFromReranked,
} from '@trapmap/server/lib/retrieval/scoring/index.js';

import type { KnowledgeReadRetrievalInfra } from './context.js';

export function createDefaultKnowledgeReadRetrievalInfra(): KnowledgeReadRetrievalInfra {
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
      createSemanticCandidate,
      mergeCandidates,
      rerankCandidates,
      toScoredEntriesFromReranked,
    },
    pgRecall: {
      isEnabled: () => process.env.USE_DB_SEARCH === 'true',
      getPool(store) {
        return typeof store.getPool === 'function' ? (store.getPool() ?? null) : null;
      },
      vectorSimilaritySearch,
      async keywordRecall(pool, queryText, filters, maxResults) {
        const pgKeywordRecall = createPgKeywordRecall({
          pool,
          featureFlag: () => true,
        });
        return pgKeywordRecall(queryText, filters, maxResults);
      },
      graphAssistedRecall,
    },
  };
}
