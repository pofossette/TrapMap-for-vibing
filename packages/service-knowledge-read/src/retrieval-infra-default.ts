import { createHash } from 'node:crypto';

import {
  type BoundaryContext,
  type FreshnessDecayConfig,
  enrichConflictHints,
} from '@trapmap/contracts';
import type { Pool } from 'pg';

import type {
  KnowledgeReadGraphQueryBackend,
  KnowledgeReadRetrievalInfra,
  KnowledgeReadRoutingDecision,
} from './context.js';
import { normalizeQuery } from './retrieval-keyword.js';
import type { MergedCandidate, RecallCandidate, ScoredEntry } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

const freshnessConfig: FreshnessDecayConfig = {
  evergreen: { enabled: false },
  versioned: {
    enabled: true,
    mode: 'step',
    matchMultiplier: 1,
    mismatchMultiplier: 0.5,
  },
  volatile: {
    enabled: true,
    mode: 'exponential',
    halfLifeDays: 30,
    zeroDays: 90,
    floor: 0.3,
  },
};
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

function routingDecision(mode: string): KnowledgeReadRoutingDecision {
  const channels =
    mode === 'graph-assisted'
      ? ['semantic', 'keyword', 'graph']
      : mode === 'hybrid'
        ? ['semantic', 'keyword']
        : ['semantic'];
  return {
    selectedMode:
      mode === 'semantic'
        ? 'local'
        : mode === 'hybrid'
          ? 'hybrid'
          : mode === 'graph-assisted'
            ? 'mix'
            : 'local',
    routeFamily: 'entry',
    routingReason: 'explicit-mode',
    fallbackApplied: !['semantic', 'hybrid', 'graph-assisted'].includes(mode),
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned: channels,
    channelsUsed: [],
  };
}

function filterByBoundary(
  entries: KnowledgeRecord[],
  context: BoundaryContext | undefined,
): KnowledgeRecord[] {
  if (!context?.versions?.length) return entries;
  return entries.filter(
    (entry) =>
      entry.boundary?.versions.every((constraint) => {
        const version = context.versions?.find(
          (item) => item.package.toLowerCase().trim() === constraint.package.toLowerCase().trim(),
        );
        return !version || satisfiesVersionRange(version.version, constraint.range);
      }) ?? true,
  );
}

function boundaryDelta(entry: KnowledgeRecord, context: BoundaryContext | undefined): number {
  if (!context || !entry.boundary) return 0;
  return (
    (context.contexts ?? []).reduce(
      (delta, queryContext) => delta + contextScoreDelta(entry, queryContext),
      0,
    ) + platformScoreDelta(entry, context.platform)
  );
}

function contextScoreDelta(entry: KnowledgeRecord, queryContext: string): number {
  const normalized = normalizeBoundaryLabel(queryContext);
  const contextExcluded = entry.boundary?.exclusions.some(
    (exclusion) =>
      exclusion.kind === 'context' &&
      matchesBoundaryDescription(exclusion.description, normalized, queryContext),
  );
  const contextIncluded = entry.boundary?.context.some(
    (label) => normalizeBoundaryLabel(label) === normalized,
  );
  return (contextExcluded ? -0.15 : 0) + (contextIncluded ? 0.1 : 0);
}

function platformScoreDelta(entry: KnowledgeRecord, platform: string | undefined): number {
  if (!platform) return 0;
  return entry.boundary?.exclusions.some(
    (exclusion) =>
      exclusion.kind === 'platform' &&
      exclusion.description.toLowerCase().includes(platform.toLowerCase()),
  )
    ? -0.15
    : 0;
}

function matchesBoundaryDescription(
  description: string,
  normalized: string,
  queryContext: string,
): boolean {
  const normalizedDescription = description.toLowerCase();
  return (
    normalizedDescription.includes(normalized) ||
    normalizedDescription.includes(queryContext.toLowerCase())
  );
}

function normalizeBoundaryLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

function parseVersion(version: string): [number, number, number] {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareVersions(left: [number, number, number], right: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1)
    if (left[index] !== right[index]) return left[index]! < right[index]! ? -1 : 1;
  return 0;
}

function satisfiesVersionRange(version: string, range: string): boolean {
  const actual = parseVersion(version);
  const trimmed = range.trim();
  const comparator = ['>=', '<=', '>', '<', '^', '~'].find((prefix) => trimmed.startsWith(prefix));
  const expected = parseVersion(comparator ? trimmed.slice(comparator.length) : trimmed);
  return matchesVersionComparator(actual, expected, comparator);
}

function matchesVersionComparator(
  actual: [number, number, number],
  expected: [number, number, number],
  comparator: string | undefined,
): boolean {
  const comparison = compareVersions(actual, expected);
  const matcher = versionRangeMatchers[comparator ?? ''] ?? exactVersionMatch;
  return matcher(actual, expected, comparison);
}

type VersionRangeMatcher = (
  actual: [number, number, number],
  expected: [number, number, number],
  comparison: number,
) => boolean;

const exactVersionMatch: VersionRangeMatcher = (_actual, _expected, comparison) => comparison === 0;

const versionRangeMatchers: Record<string, VersionRangeMatcher> = {
  '>=': (_actual, _expected, comparison) => comparison >= 0,
  '>': (_actual, _expected, comparison) => comparison > 0,
  '<=': (_actual, _expected, comparison) => comparison <= 0,
  '<': (_actual, _expected, comparison) => comparison < 0,
  '^': (actual, expected, comparison) => actual[0] === expected[0] && comparison >= 0,
  '~': (actual, expected, comparison) =>
    actual[0] === expected[0] && actual[1] === expected[1] && comparison >= 0,
};

function semanticCandidate(entry: KnowledgeRecord, score: number): RecallCandidate {
  return { entry, channel: 'semantic', score, tokenMatches: [] };
}

function mergeCandidates(
  semantic: RecallCandidate[],
  keyword: RecallCandidate[],
): MergedCandidate[] {
  const candidates = new Map<string, MergedCandidate>();
  for (const candidate of semantic)
    candidates.set(candidate.entry.id, {
      entry: candidate.entry,
      semanticScore: candidate.score,
      keywordScore: 0,
      graphScore: 0,
      channelScores: { semantic: candidate.score },
      combinedScore: candidate.score * 0.6,
      tokenMatches: [],
      channels: ['semantic'],
      preRerankScore: candidate.score * 0.6,
      finalScore: candidate.score * 0.6,
    });
  for (const candidate of keyword) {
    const existing = candidates.get(candidate.entry.id);
    if (existing) {
      existing.keywordScore = candidate.score;
      existing.channelScores.keyword = candidate.score;
      existing.tokenMatches = candidate.tokenMatches;
      existing.channels = ['semantic', 'keyword'];
      existing.combinedScore = existing.semanticScore * 0.6 + candidate.score * 0.4;
      existing.preRerankScore = existing.combinedScore;
      existing.finalScore = existing.combinedScore;
    } else
      candidates.set(candidate.entry.id, {
        entry: candidate.entry,
        semanticScore: 0,
        keywordScore: candidate.score,
        graphScore: 0,
        channelScores: { keyword: candidate.score },
        combinedScore: candidate.score * 0.4,
        tokenMatches: candidate.tokenMatches,
        channels: ['keyword'],
        preRerankScore: candidate.score * 0.4,
        finalScore: candidate.score * 0.4,
      });
  }
  return [...candidates.values()].sort(
    (left, right) =>
      right.combinedScore - left.combinedScore || left.entry.id.localeCompare(right.entry.id),
  );
}

function rerankCandidates(
  candidates: MergedCandidate[],
  tokens: string[],
  options: {
    maxCandidates: number;
    boundaryContext?: BoundaryContext;
    freshnessConfig: FreshnessDecayConfig;
    earlyTerminationThreshold?: number;
  },
): MergedCandidate[] {
  const topScore = Math.max(...candidates.map((candidate) => candidate.combinedScore));
  const threshold = options.earlyTerminationThreshold;
  const retained =
    threshold === undefined
      ? candidates
      : candidates.filter((candidate) => candidate.combinedScore >= topScore * threshold);
  return retained
    .map((candidate) => {
      const preRerankScore = candidate.combinedScore;
      let finalScore = preRerankScore;
      if (candidate.channels.includes('semantic') && candidate.channels.includes('keyword'))
        finalScore += 0.15;
      if (
        tokens.length > 0 &&
        new Set(candidate.tokenMatches.map((match) => match.token)).size / tokens.length >= 0.5
      )
        finalScore += 0.1;
      if (candidate.entry.decayMeta?.decayState === 'stale') finalScore -= 0.1;
      finalScore += boundaryDelta(candidate.entry, options.boundaryContext);
      finalScore = Math.min(1, Math.max(0, finalScore));
      return {
        ...candidate,
        combinedScore: finalScore,
        preRerankScore,
        finalScore,
      };
    })
    .sort(
      (left, right) =>
        right.combinedScore - left.combinedScore || left.entry.id.localeCompare(right.entry.id),
    )
    .slice(0, options.maxCandidates);
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
      selectStrategy: routingDecision,
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
      computeBoundaryScoreDelta: boundaryDelta,
      buildBoundaryExplanation: (_entry, context) => ({
        checked: context !== undefined,
        requiredSatisfied: true,
        warnings: [],
        boosts: [],
      }),
      filterByBoundary,
      createSemanticCandidate: semanticCandidate,
      mergeCandidates,
      rerankCandidates,
      toScoredEntriesFromReranked: (candidates): ScoredEntry[] =>
        candidates.map((candidate) => ({
          entry: candidate.entry,
          score: candidate.combinedScore,
        })),
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
