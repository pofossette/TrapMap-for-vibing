/**
 * Recall coordination: dispatch, channel functions, and graph merging.
 *
 * Extracted from orchestrator.ts to isolate all recall execution logic
 * from the orchestration pipeline.
 */

import type { RetrievalQuery, retrievalQuerySchema } from '@trapmap/contracts';
import type { Pool } from 'pg';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { DEFAULT_FRESHNESS_CONFIG } from '../decay/freshness.js';
import { AppError } from '../errors.js';
import { PostgresStore } from '../persistence/postgres-store.js';
import type { KnowledgeRecord } from '../store.js';
import { buildBoundaryExplanation, computeBoundaryScoreDelta } from './boundary-match.js';
import { vectorSimilaritySearch } from './db-search.js';
import { createSemanticCandidate, mergeCandidates } from './merge.js';
import { graphAssistedRecall as graphRecall } from './recall/graph-assisted.js';
import { keywordRecall, normalizeQuery } from './recall/keyword.js';
import { type KeywordRecallResult, createPgKeywordRecall } from './recall/pg-keyword.js';
import { getQueryEmbedding, optimizedSemanticRecall } from './recall/semantic.js';
import { rerankCandidates, toScoredEntriesFromReranked } from './rerank.js';
import type { MergedCandidate, RoutingChannel, ScoredEntry } from './types.js';

/**
 * Configuration for DB-level search.
 * Determines whether DB search is enabled and provides the connection pool.
 */
export interface DbSearchConfig {
  enabled: boolean;
  pool: Pool | null;
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
 * Dispatch retrieval based on query mode.
 *
 * @param mode - Query mode (semantic, hybrid, graph-assisted)
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @param services - Server services for DB search configuration
 * @param auth - Auth context for access control filters
 * @returns Scored entries sorted by relevance, plus merged candidates for citations
 */
export async function dispatchByMode(
  mode: string,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
  switch (mode) {
    case 'semantic':
      return await semanticRecall(seed, eligibleEntries, parsed, services, auth);
    case 'hybrid':
      return await hybridRecall(seed, eligibleEntries, parsed, services, auth);
    case 'graph-assisted':
      return await graphAssistedRecall(seed, eligibleEntries, parsed);
    default:
      throw new AppError(
        400,
        'invalid_mode',
        `Invalid query mode: ${mode}. Must be one of: semantic, hybrid, graph-assisted`,
      );
  }
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
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
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
        const finalScore = Math.min(1, Math.max(0, result.similarity + boundaryDelta));
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
      return { scoredEntries: scoredEntries.slice(0, parsed.maxResults) };
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
  return { scoredEntries: scoredEntries.slice(0, parsed.maxResults) };
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
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates: MergedCandidate[] }> {
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
  const { scoredEntries } = await optimizedSemanticRecall(queryVector, eligibleEntries, filters);
  const candidates = scoredEntries.map(({ entry, score }) => createSemanticCandidate(entry, score));
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Graph score boost factor for graph-assisted retrieval.
 */
export const GRAPH_SCORE_BOOST_FACTOR = 0.2;

/**
 * Graph-assisted recall combining hybrid baseline with graph expansion.
 */
export async function graphAssistedRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates: MergedCandidate[] }> {
  const queryTokens = normalizeQuery(seed);
  const eligibleEntriesMap = new Map<string, KnowledgeRecord>();
  for (const entry of eligibleEntries) {
    eligibleEntriesMap.set(entry.id, entry);
  }

  const [semanticCandidates, keywordCandidates, graphCandidates] = await Promise.all([
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    keywordRecall(seed, eligibleEntries),
    graphRecall(seed, eligibleEntriesMap),
  ]);

  const hybridMerged = mergeCandidates(semanticCandidates, keywordCandidates);
  const finalMerged = mergeCandidatesWithGraph(hybridMerged, graphCandidates);

  const rerankedCandidates = rerankCandidates(finalMerged, queryTokens, {
    maxCandidates: parsed.maxResults,
    ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
    freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
    earlyTerminationThreshold: 0.3,
  });

  const scoredEntries = toScoredEntriesFromReranked(rerankedCandidates);
  return { scoredEntries, mergedCandidates: rerankedCandidates };
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
