/**
 * Recall coordination: dispatch, channel functions, and graph merging.
 *
 * Extracted from orchestrator.ts to isolate all recall execution logic
 * from the orchestration pipeline.
 */

import type { RetrievalQuery, retrievalQuerySchema } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import { DEFAULT_FRESHNESS_CONFIG } from '@trapmap/server/lib/decay/index.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { GraphQueryRuntimeState } from '@trapmap/server/lib/graph-query/index.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { vectorSimilaritySearch } from '@trapmap/server/lib/retrieval/recall/db-search.js';
import { graphAssistedRecall as graphRecall } from '@trapmap/server/lib/retrieval/recall/graph-assisted.js';
import { keywordRecall, normalizeQuery } from '@trapmap/server/lib/retrieval/recall/keyword.js';
import { createPgKeywordRecall } from '@trapmap/server/lib/retrieval/recall/pg-keyword.js';
import {
  computeScore,
  getQueryEmbedding,
  optimizedSemanticRecall,
} from '@trapmap/server/lib/retrieval/recall/semantic.js';
import {
  buildBoundaryExplanation,
  computeBoundaryScoreDelta,
  createSemanticCandidate,
  mergeCandidates,
  rerankCandidates,
  toScoredEntriesFromReranked,
} from '@trapmap/server/lib/retrieval/scoring/index.js';
import type {
  MergedCandidate,
  RoutingChannel,
  ScoredEntry,
} from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';
import type { ChannelRegistry } from './channel-registry.js';
import type { StrategyRegistry } from './strategy-registry.js';

/**
 * Configuration for DB-level search.
 * Determines whether DB search is enabled and provides the connection pool.
 */
export interface DbSearchConfig {
  enabled: boolean;
  pool: Pool | null;
}

export interface GraphRecallTrace {
  mergeMode: 'mixed';
  graphExpansion: 'local-neighborhood';
  backendKind: GraphQueryRuntimeState['backendKind'];
  backendMode: GraphQueryRuntimeState['mode'];
  graphCandidateCount: number;
}

export interface RecallExecutionTrace {
  graph?: GraphRecallTrace;
}

export interface RecallExecutionResult {
  scoredEntries: ScoredEntry[];
  mergedCandidates?: MergedCandidate[];
  trace?: RecallExecutionTrace;
}

/**
 * Get DB search configuration from services.
 * Checks the USE_DB_SEARCH environment variable and pool availability.
 */
export function getDbSearchConfig(services: SkillShareerServices): DbSearchConfig {
  const enabled = process.env.USE_DB_SEARCH === 'true';
  const pool = services.store instanceof PostgresStore ? services.store.getPool() : null;
  return { enabled: enabled && pool !== null, pool };
}

/**
 * Infer routing channels from merged candidates after recall execution.
 * Extracts the set of channels that actually contributed to results.
 */
export function inferChannelsFromMerged(mergedCandidates?: MergedCandidate[]): RoutingChannel[] {
  if (!mergedCandidates || mergedCandidates.length === 0) {
    return ['semantic'];
  }
  const channelSet = new Set<RoutingChannel>();
  for (const candidate of mergedCandidates) {
    for (const ch of candidate.channels) {
      channelSet.add(ch);
    }
  }
  return Array.from(channelSet);
}

/**
 * Dispatch retrieval based on query mode using StrategyRegistry lookup.
 *
 * @param mode - Query mode (semantic, hybrid, graph-assisted)
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @param strategyRegistry - Registry of retrieval strategies
 * @param channelRegistry - Registry of recall channels
 * @param services - Server services for DB search configuration
 * @param auth - Auth context for access control filters
 * @returns Scored entries sorted by relevance, plus merged candidates for citations
 */
export async function dispatchByMode(
  mode: string,
  _seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  strategyRegistry: StrategyRegistry,
  channelRegistry: ChannelRegistry,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const strategy = strategyRegistry.get(mode);
  if (!strategy) {
    throw new AppError(
      400,
      'invalid_mode',
      `Invalid query mode: ${mode}. Must be one of: ${strategyRegistry
        .all()
        .map((s) => s.version)
        .join(', ')}`,
    );
  }
  return strategy.execute(parsed, channelRegistry, eligibleEntries, services, auth);
}

/**
 * Semantic recall using embeddings.
 *
 * When DB search is enabled and PostgreSQL pool is available, uses
 * vectorSimilaritySearch() for O(log n) indexed search instead of
 * O(n) in-memory computation.
 */
export async function semanticRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };

  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      const queryVector = await getQueryEmbedding(seed);
      const scopeFilter =
        parsed.filters?.scopes?.length === 1 ? parsed.filters.scopes[0] : undefined;
      const dbResults = await vectorSimilaritySearch(dbConfig.pool, {
        queryVector,
        limit: parsed.maxResults * 2,
        teamId: auth.activeTeamId,
        maxLevel: auth.securityLevel,
        ...(scopeFilter ? { scope: scopeFilter } : {}),
      });

      const eligibleIds = new Set(eligibleEntries.map((e) => e.id));
      const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));

      const scoredEntries: ScoredEntry[] = [];
      for (const result of dbResults) {
        if (!eligibleIds.has(result.entryId)) continue;
        const entry = entryMap.get(result.entryId);
        if (!entry) continue;

        const boundaryDelta = computeBoundaryScoreDelta(entry, parsed.boundaryContext);
        const boostedScore = computeScore(result.similarity, entry, parsed.filters, seed);
        const finalScore = Math.min(1, Math.max(0, boostedScore + boundaryDelta));
        const boundaryExplanation = parsed.boundaryContext
          ? buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta)
          : undefined;

        const scoredEntry: ScoredEntry = { entry, score: finalScore };
        if (boundaryExplanation !== undefined) {
          scoredEntry.boundaryExplanation = boundaryExplanation;
        }
        scoredEntries.push(scoredEntry);
      }

      scoredEntries.sort((a, b) => b.score - a.score);
      const sliced = scoredEntries.slice(0, parsed.maxResults);
      const mergedCandidates = mergeCandidates(
        sliced.map(({ entry, score }) => createSemanticCandidate(entry, score)),
        [],
      );
      return { scoredEntries: sliced, mergedCandidates };
    } catch (error) {
      console.error('[semanticRecall] DB search failed, falling back to in-memory:', error);
    }
  }

  // In-memory fallback
  const queryVector = await getQueryEmbedding(seed);
  const { scoredEntries: rawScoredEntries } = await optimizedSemanticRecall(
    queryVector,
    eligibleEntries,
    parsed.filters,
    seed,
  );

  const scoredEntries: ScoredEntry[] = rawScoredEntries.map(({ entry, score }) => {
    const boundaryDelta = computeBoundaryScoreDelta(entry, parsed.boundaryContext);
    const finalScore = Math.min(1, Math.max(0, score + boundaryDelta));
    const boundaryExplanation = parsed.boundaryContext
      ? buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta)
      : undefined;
    const result: ScoredEntry = { entry, score: finalScore };
    if (boundaryExplanation !== undefined) {
      result.boundaryExplanation = boundaryExplanation;
    }
    return result;
  });

  scoredEntries.sort((a, b) => b.score - a.score);
  const sliced = scoredEntries.slice(0, parsed.maxResults);
  const mergedCandidates = mergeCandidates(
    sliced.map(({ entry, score }) => createSemanticCandidate(entry, score)),
    [],
  );
  return { scoredEntries: sliced, mergedCandidates };
}

/**
 * Hybrid recall combining semantic and keyword channels.
 *
 * Pipeline:
 * 1. Run semantic recall in parallel with keyword recall
 * 2. Merge candidates from both channels (dedupe by entry.id)
 * 3. Rerank merged candidates using heuristic boosts
 * 4. Return scored entries sorted by final score
 */
export async function hybridRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const queryTokens = normalizeQuery(seed);
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };

  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      const eligibleIds = new Set(eligibleEntries.map((e) => e.id));
      const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));

      const pgKeywordRecall = createPgKeywordRecall({
        pool: dbConfig.pool,
        featureFlag: () => true,
      });

      const [queryVector, keywordResults] = await Promise.all([
        getQueryEmbedding(seed),
        pgKeywordRecall(
          seed,
          {
            teamId: auth.activeTeamId,
            securityLevel: auth.securityLevel,
            isSystemAdmin: auth.subjectType === 'system-admin',
            scopes: parsed.filters?.scopes?.length ? parsed.filters.scopes : ['global', 'project'],
          },
          parsed.maxResults * 2,
        ),
      ]);

      const dbScopeFilter =
        parsed.filters?.scopes?.length === 1 ? parsed.filters.scopes[0] : undefined;
      const dbVectorResults = await vectorSimilaritySearch(dbConfig.pool, {
        queryVector,
        limit: parsed.maxResults * 2,
        teamId: auth.activeTeamId,
        maxLevel: auth.securityLevel,
        ...(dbScopeFilter ? { scope: dbScopeFilter } : {}),
      });

      const semanticCandidates = dbVectorResults
        .filter((r) => eligibleIds.has(r.entryId))
        .map((r) => {
          const entry = entryMap.get(r.entryId);
          if (!entry) return null;
          return createSemanticCandidate(entry, r.similarity);
        })
        .filter((c): c is NonNullable<ReturnType<typeof createSemanticCandidate>> => c !== null);

      const keywordCandidates: Awaited<ReturnType<typeof keywordRecall>> = keywordResults
        .filter((r) => eligibleIds.has(r.entryId))
        .map((r) => {
          const entry = entryMap.get(r.entryId);
          if (!entry) return null;
          return {
            entry,
            score: r.score,
            tokenMatches: r.tokenMatches,
          };
        })
        .filter(
          (c): c is NonNullable<Awaited<ReturnType<typeof keywordRecall>>[number]> => c !== null,
        );

      const mergedCandidates = mergeCandidates(semanticCandidates, keywordCandidates);
      const rerankedCandidates = rerankCandidates(mergedCandidates, queryTokens, {
        maxCandidates: parsed.maxResults,
        ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
        freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
        earlyTerminationThreshold: 0.3,
      });

      const scoredEntries = toScoredEntriesFromReranked(rerankedCandidates);
      return { scoredEntries, mergedCandidates: rerankedCandidates };
    } catch (error) {
      console.error('[hybridRecall] DB search failed, falling back to in-memory:', error);
    }
  }

  // In-memory fallback
  const [semanticCandidates, keywordCandidates] = await Promise.all([
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    keywordRecall(seed, eligibleEntries),
  ]);

  const mergedCandidates = mergeCandidates(semanticCandidates, keywordCandidates);
  const rerankedCandidates = rerankCandidates(mergedCandidates, queryTokens, {
    maxCandidates: parsed.maxResults,
    ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
    freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    earlyTerminationThreshold: 0.3,
  });

  const scoredEntries = toScoredEntriesFromReranked(rerankedCandidates);
  return { scoredEntries, mergedCandidates: rerankedCandidates };
}

/**
 * Compute semantic candidates for hybrid recall.
 * Returns RecallCandidate[] for merge compatibility.
 */
export async function computeSemanticCandidates(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
): Promise<ReturnType<typeof createSemanticCandidate>[]> {
  const queryVector = await getQueryEmbedding(seed);
  const { scoredEntries } = await optimizedSemanticRecall(
    queryVector,
    eligibleEntries,
    filters,
    seed,
  );
  const candidates = scoredEntries.map(({ entry, score }) => createSemanticCandidate(entry, score));
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Graph score boost factor for graph-assisted retrieval.
 */
export const GRAPH_SCORE_BOOST_FACTOR = 0.2;

/**
 * Graph-assisted recall combines the normal hybrid baseline with graph-derived
 * local-neighborhood candidates. Graph structure augments recall but does not
 * replace semantic/keyword retrieval as the primary decision surface.
 */
export async function graphAssistedRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
): Promise<RecallExecutionResult> {
  const queryTokens = normalizeQuery(seed);
  const eligibleEntriesMap = new Map<string, KnowledgeRecord>();
  for (const entry of eligibleEntries) {
    eligibleEntriesMap.set(entry.id, entry);
  }

  const [semanticCandidates, keywordCandidates, graphCandidates] = await Promise.all([
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    keywordRecall(seed, eligibleEntries),
    graphRecall(
      seed,
      eligibleEntriesMap,
      services?.graphQueryBackend ? { graphQueryBackend: services.graphQueryBackend } : undefined,
    ),
  ]);
  const governedGraphCandidates = graphCandidates
    .map((candidate) => {
      const eligibleEntry = eligibleEntriesMap.get(candidate.entry.id);
      if (!eligibleEntry) {
        return null;
      }

      return candidate.entry === eligibleEntry ? candidate : { ...candidate, entry: eligibleEntry };
    })
    .filter(
      (candidate): candidate is Awaited<ReturnType<typeof graphRecall>>[number] =>
        candidate !== null,
    );

  const hybridMerged = mergeCandidates(semanticCandidates, keywordCandidates);
  const finalMerged = mergeCandidatesWithGraph(hybridMerged, governedGraphCandidates);

  const rerankedCandidates = rerankCandidates(finalMerged, queryTokens, {
    maxCandidates: parsed.maxResults,
    ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
    freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    earlyTerminationThreshold: 0.3,
  });

  const scoredEntries = toScoredEntriesFromReranked(rerankedCandidates);
  return {
    scoredEntries,
    mergedCandidates: rerankedCandidates,
    trace: {
      graph: createGraphRecallTrace(
        services?.graphQueryBackend?.getRuntimeState() ?? services?.graphQuery,
        governedGraphCandidates.length,
      ),
    },
  };
}

/**
 * Merge graph candidates with hybrid candidates.
 * Extends the merge logic to support graph channel evidence.
 */
export function mergeCandidatesWithGraph(
  hybridMerged: ReturnType<typeof mergeCandidates>,
  graphCandidates: Awaited<ReturnType<typeof graphRecall>>,
): MergedCandidate[] {
  const result = [...hybridMerged];

  for (const graphCandidate of graphCandidates) {
    const existing = result.find((c) => c.entry.id === graphCandidate.entry.id);

    if (existing) {
      existing.channels.push('graph');
      existing.graphScore = graphCandidate.score;
      const preRerankScore = existing.combinedScore;
      const finalScore = Math.min(
        1,
        preRerankScore + graphCandidate.score * GRAPH_SCORE_BOOST_FACTOR,
      );
      existing.combinedScore = finalScore;
      existing.preRerankScore = preRerankScore;
      existing.finalScore = finalScore;
    } else {
      const score = graphCandidate.score;
      result.push({
        entry: graphCandidate.entry,
        semanticScore: 0,
        keywordScore: 0,
        graphScore: graphCandidate.score,
        channelScores: { graph: graphCandidate.score },
        combinedScore: score,
        tokenMatches: [],
        channels: ['graph'],
        preRerankScore: score,
        finalScore: score,
      });
    }
  }

  result.sort((a, b) => b.combinedScore - a.combinedScore);
  return result;
}

function createGraphRecallTrace(
  runtimeState: GraphQueryRuntimeState | undefined,
  graphCandidateCount: number,
): GraphRecallTrace {
  return {
    mergeMode: 'mixed',
    graphExpansion: 'local-neighborhood',
    backendKind: runtimeState?.backendKind ?? 'memory',
    backendMode: runtimeState?.mode ?? 'disabled',
    graphCandidateCount,
  };
}
