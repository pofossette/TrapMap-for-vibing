import { createHash } from 'node:crypto';

import {
  DEFAULT_FRESHNESS_DECAY_CONFIG,
  computeBoundaryScoreDelta,
  createSemanticCandidate,
  filterByBoundary,
  mergeCandidates,
  normalizeQuery,
  rerankCandidates,
  routingDecision,
} from '@trapmap/backend-core';
import { type FreshnessDecayConfig, enrichConflictHints } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { KnowledgeReadGraphQueryBackend, KnowledgeReadRetrievalInfra } from './context.js';
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
) {
  const conditions = ["ke.status = 'synced'"];
  const params: Array<string | number | string[]> = [];
  let paramIndex = 1;
  if (options.teamId !== undefined) {
    if (options.teamId === null) {
      conditions.push('ke.team_id IS NULL');
    } else {
      conditions.push(`(ke.team_id IS NULL OR ke.team_id = $${paramIndex})`);
      params.push(options.teamId);
      paramIndex += 1;
    }
  }
  conditions.push(`ke.required_level <= $${paramIndex}`);
  params.push(options.maxLevel ?? 0);
  paramIndex += 1;
  if (options.scope) {
    conditions.push(`ke.scope = $${paramIndex}`);
    params.push(options.scope);
    paramIndex += 1;
  }
  if (options.entryIds && options.entryIds.length > 0) {
    conditions.push(`ke.entry_id = ANY($${paramIndex})`);
    params.push(options.entryIds);
    paramIndex += 1;
  }
  const vectorIndex = paramIndex;
  params.push(`[${options.queryVector.join(',')}]`);
  params.push(options.limit);
  const result = await pool.query<{
    entry_id: string;
    similarity: number;
    shortcut: string;
    labels: string[];
    scope: string;
    required_level: number;
  }>(
    `SELECT ke.entry_id, 1 - (ke.vector <=> $${vectorIndex}::vector) AS similarity, COALESCE(entries.shortcut, ke.entry_id) AS shortcut, COALESCE(entries.labels, '{}'::text[]) AS labels, ke.scope, ke.required_level FROM knowledge_embeddings ke LEFT JOIN knowledge_entries entries ON entries.id = ke.entry_id WHERE ${conditions.join(' AND ')} ORDER BY ke.vector <=> $${vectorIndex}::vector LIMIT $${vectorIndex + 1}`,
    params,
  );
  return result.rows.map((row) => ({
    entryId: row.entry_id,
    similarity: Math.max(0, Math.min(1, row.similarity)),
    metadata: {
      shortcut: row.shortcut,
      labels: row.labels,
      scope: row.scope,
      requiredLevel: row.required_level,
    },
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
    `SELECT entry_id, tokens, field_tokens_shortcut, field_tokens_detail, field_tokens_labels FROM knowledge_keywords WHERE ${conditions.join(' AND ')} LIMIT $${paramIndex}`,
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

export function createDefaultKnowledgeReadRetrievalInfra(): KnowledgeReadRetrievalInfra {
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
      vectorSimilaritySearch,
      keywordRecall,
      graphAssistedRecall: graphRecall,
    },
  };
}
