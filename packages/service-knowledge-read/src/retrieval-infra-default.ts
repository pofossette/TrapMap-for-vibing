import { createHash } from 'node:crypto';

import {
  computeBoundaryScoreDelta,
  createSemanticCandidate,
  DEFAULT_FRESHNESS_DECAY_CONFIG,
  filterByBoundary,
  mergeCandidates,
  normalizeQuery,
  rerankCandidates,
  routingDecision,
} from '@trapmap/backend-core';
import { enrichConflictHints, type FreshnessDecayConfig } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { KnowledgeReadGraphQueryBackend, KnowledgeReadRetrievalInfra } from './context.js';
import {
  createKnowledgeEmbeddingsVectorSearchPort,
  type KnowledgeEmbeddingVectorSearchFilters,
  type KnowledgeEmbeddingVectorSearchPort,
} from './knowledge-vector-search-port.js';
import { artifactVersionOf, type RecallCandidate, type ScoredEntry } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

const freshnessConfig: FreshnessDecayConfig = DEFAULT_FRESHNESS_DECAY_CONFIG;
const queryEmbeddings = new Map<string, number[]>();

function embed(text: string): number[] {
  const vector = Array.from({ length: 384 }, () => 0);
  for (const token of normalizeQuery(text)) {
    const hash = createHash('sha256').update(token).digest();
    for (let index = 0; index < hash.length; index += 1) {
      vector[hash[index]! % vector.length]! += hash[index]! % 2 === 0 ? 1 : -1;
    }
  }
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
}

interface DefaultRetrievalInfraOptions {
  vectorSearchPort?: KnowledgeEmbeddingVectorSearchPort;
}

async function vectorSimilaritySearch(
  pool: Pool,
  options: {
    queryVector: number[];
    limit: number;
    teamId?: string | null;
    maxLevel?: number;
    scope?: 'global' | 'project';
    entryIds?: string[];
  },
  injectedPort?: KnowledgeEmbeddingVectorSearchPort,
) {
  const port = injectedPort ?? createKnowledgeEmbeddingsVectorSearchPort(pool);
  const filters: KnowledgeEmbeddingVectorSearchFilters = {
    ...(options.teamId !== undefined ? { teamId: options.teamId } : {}),
    maxRequiredLevel: options.maxLevel ?? 0,
    scopes: options.scope ? [options.scope] : ['global', 'project'],
    ...(options.entryIds ? { sourceIds: options.entryIds } : {}),
  };
  const hits = await port.search(options.queryVector, filters, options.limit);
  return hits.map((hit) => ({
    entryId: hit.sourceId,
    similarity: hit.similarity,
    metadata: hit.metadata,
  }));
}

async function keywordRecall(
  pool: Pool,
  query: string,
  filters: {
    teamId: string | null;
    securityLevel: number;
    isSystemAdmin: boolean;
    scopes: string[];
  },
  limit: number,
) {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) return [];
  const conditions = ["status = 'synced'"];
  const params: Array<string | number | string[]> = [];
  let paramIndex = 1;
  if (!filters.isSystemAdmin) {
    if (filters.teamId) {
      conditions.push(`(team_id IS NULL OR team_id = $${paramIndex})`);
      params.push(filters.teamId);
      paramIndex += 1;
    } else {
      conditions.push('team_id IS NULL');
    }
  }
  conditions.push(`required_level <= $${paramIndex}`);
  params.push(filters.securityLevel);
  paramIndex += 1;
  if (filters.scopes.length > 0) {
    conditions.push(`scope = ANY($${paramIndex}::text[])`);
    params.push(filters.scopes);
    paramIndex += 1;
  }
  conditions.push(`tokens && $${paramIndex}::text[]`);
  params.push(tokens);
  paramIndex += 1;
  params.push(limit * 2);
  const result = await pool.query<{
    entry_id: string;
    tokens: string[];
    field_tokens_shortcut: string[];
    field_tokens_detail: string[];
    field_tokens_labels: string[];
  }>(
    `SELECT entry_id, tokens, field_tokens_shortcut, field_tokens_detail, field_tokens_labels FROM knowledge_search_documents WHERE ${conditions.join(' AND ')} LIMIT $${paramIndex}`,
    params,
  );
  return result.rows
    .map((row) => {
      const matches = tokens
        .map((token) => ({
          token,
          fields: [
            row.field_tokens_labels.includes(token) && 'labels',
            row.field_tokens_shortcut.includes(token) && 'shortcut',
            row.field_tokens_detail.includes(token) && 'detail',
          ].filter(Boolean) as Array<'labels' | 'shortcut' | 'detail'>,
        }))
        .filter((match) => match.fields.length > 0);
      return {
        entryId: row.entry_id,
        score: matches.length / tokens.length,
        tokenMatches: matches,
      };
    })
    .filter((row) => row.tokenMatches.length > 0)
    .slice(0, limit);
}

async function graphRecall(
  query: string,
  entries: Map<string, KnowledgeRecord>,
  options?: { graphQueryBackend?: KnowledgeReadGraphQueryBackend },
): Promise<RecallCandidate[]> {
  const backend = options?.graphQueryBackend;
  if (!backend) return [];
  const labels = new Set(normalizeQuery(query));
  const ids = await backend.expandSourcesOneHop({
    queryLabels: labels,
    eligibleSourceIds: new Set(entries.keys()),
  });
  return Promise.all(
    [...ids].flatMap((id) => {
      const entry = entries.get(id);
      return entry
        ? [
            backend
              .calculateSourceRelationStrength({
                sourceId: id,
                queryLabels: labels,
              })
              .then((strength) => ({
                entry,
                channel: 'graph' as const,
                score: Math.min(1, 0.3 + strength * 0.01),
                tokenMatches: [],
              })),
          ]
        : [];
    }),
  );
}

export function createDefaultKnowledgeReadRetrievalInfra(
  options: DefaultRetrievalInfraOptions = {},
): KnowledgeReadRetrievalInfra {
  return {
    embeddings: {
      generate: async (text) => embed(text),
      hashText: (text) => createHash('sha256').update(text).digest('hex'),
      getCachedQuery: (text) => queryEmbeddings.get(normalizeQuery(text).join(' ')) ?? null,
      setCachedQuery: (text, vector) => queryEmbeddings.set(normalizeQuery(text).join(' '), vector),
    },
    routing: {
      selectStrategy: (mode) => routingDecision(mode),
      toRoutingTrace: (decision) => ({
        ...decision,
        channelsUsed: decision.channelsUsed,
      }),
    },
    conflicts: {
      enrichMatches: (matches, data, governance) =>
        enrichConflictHints(
          matches,
          data.conflicts,
          data.knowledgeEntries,
          governance ?? { teamId: null, requiredLevel: 0 },
        ),
    },
    scoring: {
      freshnessConfig,
      computeBoundaryScoreDelta,
      buildBoundaryExplanation: (_entry, context) => ({
        checked: context !== undefined,
        requiredSatisfied: true,
        warnings: [],
        boosts: [],
      }),
      filterByBoundary,
      createSemanticCandidate,
      mergeCandidates,
      rerankCandidates,
      toScoredEntriesFromReranked: (candidates): ScoredEntry[] =>
        candidates.map((candidate) => {
          const scoredEntry: ScoredEntry = {
            entry: candidate.entry,
            score: candidate.combinedScore,
          };
          const version = artifactVersionOf(candidate.entry);
          if (version !== undefined) {
            scoredEntry.version = version;
          }
          const revision = candidate.entry.latestRevision?.revision;
          if (revision !== undefined) {
            scoredEntry.revision = revision;
          }
          return scoredEntry;
        }),
    },
    pgRecall: {
      isEnabled: () => process.env.USE_DB_SEARCH === 'true',
      getPool: (store) => store.getPool?.() ?? null,
      vectorSimilaritySearch: (pool, request) =>
        vectorSimilaritySearch(pool, request, options.vectorSearchPort),
      keywordRecall,
      graphAssistedRecall: graphRecall,
    },
  };
}
