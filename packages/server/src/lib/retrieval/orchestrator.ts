import {
  type BoundaryExplanation,
  type CapsuleMatch,
  type ProfileHint,
  type RetrievalCitation,
  type RetrievalQuery,
  type RetrievalResponse,
  type RetrievalStrategy,
  type RetrievalV2Query,
  type RetrievalV2Response,
  type RoutingReason,
  capsuleMatchSchema,
  profileHintSchema,
  retrievalQuerySchema,
  retrievalV2QuerySchema,
} from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { generateEmbedding, hashEmbeddingText } from '../embeddings.js';
import { AppError } from '../errors.js';
import { PostgresStore } from '../persistence/postgres-store.js';
import type { PipelineStep, RagLogEntry } from '../rag-log.js';
import { generateQueryId, logRagRetrieval } from '../rag-log.js';
import type { KnowledgeRecord } from '../store.js';
import { nowIso } from '../store.js';
import {
  assembleResponseBuckets,
  buildAllActivationHints,
  buildCapsuleMatch,
  buildEmptyResponse,
  buildEmptyV2Response,
  buildProfileHint,
  buildRetrievalResponse,
  buildV2RetrievalResponse,
} from './assembly.js';
import { buildBoundaryExplanation, computeBoundaryScoreDelta } from './boundary-match.js';
import { buildProfileShortlist, getCapsuleRecords, rankCapsules } from './capsule-recall.js';
import { buildCitations } from './citations.js';
import { vectorSimilaritySearch } from './db-search.js';
import { filterEligibleEntries, filterByBoundaryContext } from './filters.js';
import { parseSeedIntent } from './intent.js';
import { createSemanticCandidate, mergeCandidates, toScoredEntries } from './merge.js';
import { graphAssistedRecall as graphRecall } from './recall/graph-assisted.js';
import { keywordRecall, normalizeQuery } from './recall/keyword.js';
import { createPgKeywordRecall, type KeywordRecallResult } from './recall/pg-keyword.js';
import {
  buildEmbeddingText,
  computeScore,
  cosineSimilarity,
  getQueryEmbedding,
  getEntryEmbedding as semanticGetEntryEmbedding,
} from './recall/semantic.js';
import { rerankCandidates, toScoredEntriesFromReranked } from './rerank.js';
import { enrichMatchesWithConflicts } from '../conflict/enrich.js';
import { DEFAULT_FRESHNESS_CONFIG } from '../decay/freshness.js';
import { buildCapsuleCitations, buildCapsuleSummary, buildSummary } from './summary.js';
import type {
  MergedCandidate,
  RetrievalPipelineContext,
  RoutingChannel,
  ScoredEntry,
} from './types.js';

interface RetrievalDecision {
  selectedMode: RetrievalStrategy;
  routeFamily: 'entry' | 'capsule' | 'graph-plan';
  routingReason: RoutingReason;
  fallbackApplied: boolean;
  fallbackTarget: null;
  confidenceScore: number | null;
  confidenceBucket: 'low' | 'medium' | 'high' | null;
  channelsPlanned: RoutingChannel[];
  channelsUsed: RoutingChannel[];
}

/**
 * Configuration for DB-level search.
 * Determines whether DB search is enabled and provides the connection pool.
 */
interface DbSearchConfig {
  enabled: boolean;
  pool: Pool | null;
}

/**
 * Get DB search configuration from services.
 * Checks the USE_DB_SEARCH environment variable and pool availability.
 */
function getDbSearchConfig(services: SkillShareerServices): DbSearchConfig {
  const enabled = process.env.USE_DB_SEARCH === 'true';
  const pool = services.store instanceof PostgresStore ? services.store.getPool() : null;
  return { enabled: enabled && pool !== null, pool };
}

function toRoutingTrace(decision: RetrievalDecision) {
  return {
    selectedMode: decision.selectedMode,
    routeFamily: decision.routeFamily,
    routingReason: decision.routingReason,
    fallbackApplied: decision.fallbackApplied,
    fallbackTarget: decision.fallbackTarget,
    confidenceScore: decision.confidenceScore,
    confidenceBucket: decision.confidenceBucket,
    channelsUsed: decision.channelsUsed,
  };
}

/**
 * Graph score boost factor for graph-assisted retrieval.
 * When a candidate is found via graph relationships, its score is boosted
 * by this fraction of the graph score to account for relationship relevance.
 */
const GRAPH_SCORE_BOOST_FACTOR = 0.2;

// =============================================================================
// Phase 29: Deterministic Router Selection (EOPS-03)
// Extract routing logic into an explicit helper that produces RoutingDecision.
// =============================================================================

/**
 * Map v1 public mode to internal strategy and channels.
 * This mapping preserves backward compatibility while producing trace metadata.
 */
const V1_MODE_TO_STRATEGY: Record<string, RetrievalStrategy> = {
  semantic: 'local',
  hybrid: 'hybrid',
  'graph-assisted': 'mix',
};

/**
 * Get channels planned for a given v1 public mode.
 */
function getV1ChannelsPlanned(mode: string): RoutingChannel[] {
  switch (mode) {
    case 'semantic':
      return ['semantic'];
    case 'hybrid':
      return ['semantic', 'keyword'];
    case 'graph-assisted':
      return ['semantic', 'keyword', 'graph'];
    default:
      return ['semantic'];
  }
}

/**
 * Select retrieval strategy for v1 (entry-based) endpoint.
 *
 * The router produces a deterministic RoutingDecision from:
 * - The explicit mode requested by the client (if any)
 * - Deterministic cues from parseSeedIntent (for auto mode)
 *
 * @param requestedMode - The v1 mode from the request (semantic, hybrid, graph-assisted)
 * @param seed - The raw seed text (used for deterministic auto-routing)
 * @returns RoutingDecision with selected strategy and trace metadata
 */
export function selectRetrievalStrategy(requestedMode: string, seed: string): RetrievalDecision {
  // v1 always uses explicit mode - no auto-routing needed yet
  // Future: if requestedMode === 'auto', use parseSeedIntent for deterministic selection
  const strategy = V1_MODE_TO_STRATEGY[requestedMode] ?? 'local';
  const channelsPlanned = getV1ChannelsPlanned(requestedMode);
  const routingReason: RoutingReason = 'explicit-mode';

  return {
    selectedMode: strategy,
    routeFamily: 'entry',
    routingReason,
    fallbackApplied: strategy !== V1_MODE_TO_STRATEGY[requestedMode],
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned,
    channelsUsed: [], // Populated after recall execution
  };
}

/**
 * Select retrieval strategy for v2 (capsule-native) endpoint.
 *
 * v2 currently has no explicit mode field in the request contract,
 * so the router always chooses the capsule strategy.
 *
 * @param seed - The raw seed text (for future auto-routing extensions)
 * @returns RoutingDecision with selected strategy and trace metadata
 */
export function selectRetrievalStrategyV2(seed: string): RetrievalDecision {
  // v2 defaults to capsule-native retrieval
  // Future: add auto-routing based on parsed intent
  const strategy: RetrievalStrategy = 'local';
  const routingReason: RoutingReason = 'v2-default-capsule';

  return {
    selectedMode: strategy,
    routeFamily: 'capsule',
    routingReason,
    fallbackApplied: false,
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned: ['capsule', 'profile'],
    channelsUsed: [], // Populated after recall execution
  };
}

/**
 * Time a pipeline step and record its latency.
 * Used to capture detailed timing for RAG logging.
 *
 * @param name - Name of the pipeline step
 * @param fn - Async function to execute
 * @param steps - Array to append the step timing to
 * @returns The result of the function
 */
async function timedStep<T>(name: string, fn: () => Promise<T>, steps: PipelineStep[]): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  steps.push({ name, latencyMs });
  return result;
}

/**
 * Main retrieval pipeline orchestrator.
 *
 * Pipeline order (enforced for security):
 * 1. Eligibility filtering (approval, team, level, metadata)
 * 2. Mode dispatch (semantic, hybrid, graph-assisted)
 * 3. Response assembly (bucket split and output shaping)
 * 4. Optional summary generation (if requested and citations available)
 * 5. Optional refinement (if requested and provider configured)
 *
 * Query modes:
 * - semantic: embedding-based retrieval (default)
 * - hybrid: combines semantic and keyword channels with weighted merge
 * - graph-assisted: hybrid baseline + graph expansion through relationships
 *
 * @param services - Server services (config, store)
 * @param auth - Resolved auth context
 * @param query - Retrieval query with filters
 * @returns Retrieval response with global constraints and project knowledge
 */
export async function searchKnowledge(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: RetrievalQuery,
): Promise<RetrievalResponse> {
  const startMs = Date.now();
  const queryId = generateQueryId();
  const steps: PipelineStep[] = [];

  try {
    // Parse and validate query
    const parsed = await timedStep(
      'parse',
      () => Promise.resolve(retrievalQuerySchema.parse(query)),
      steps,
    );

    // Get current data snapshot
    const data = await timedStep('snapshot', () => services.store.snapshot(), steps);

    // Filter eligible entries (approval, team, level, metadata)
    const eligibleEntries = await timedStep(
      'eligibility',
      () => Promise.resolve(filterEligibleEntries(data.knowledgeEntries, auth, parsed.filters)),
      steps,
    );

    // Filter by boundary constraints (BOUND-04)
    const boundaryFiltered = await timedStep(
      'boundary-filter',
      () => Promise.resolve(filterByBoundaryContext(eligibleEntries, parsed.boundaryContext)),
      steps,
    );

    if (boundaryFiltered.length === 0) {
      // Log even for empty results (with routing trace)
      const emptyRouting = selectRetrievalStrategy(parsed.mode, parsed.seed);
      void logRagRetrieval(services.config.ragLog, {
        timestamp: new Date(startMs).toISOString(),
        queryId,
        seed: parsed.seed,
        mode: parsed.mode,
        actorId: auth.actorId,
        teamId: auth.activeTeamId,
        pipelineSteps: steps,
        totalLatencyMs: Date.now() - startMs,
        resultCount: 0,
        metadata: {
          filters: parsed.filters,
          maxResults: parsed.maxResults,
          includeSummary: parsed.includeSummary ?? false,
          includeRefinement: parsed.includeRefinement ?? false,
          routingTrace: toRoutingTrace(emptyRouting),
        },
      });
      return buildEmptyResponse();
    }

    // Resolve routing strategy before dispatch (Phase 29)
    const routingDecision = await timedStep(
      'routing',
      () => Promise.resolve(selectRetrievalStrategy(parsed.mode, parsed.seed)),
      steps,
    );

    // Dispatch based on query mode (with DB-level search integration)
    const { scoredEntries, mergedCandidates } = await timedStep(
      'recall',
      () => dispatchByMode(parsed.mode, parsed.seed, boundaryFiltered, parsed, services, auth),
      steps,
    );

    // Update routing channels used from recall results
    routingDecision.channelsUsed = inferChannelsFromMerged(mergedCandidates);

    // Build citations from merged candidates (if available)
    const citations = mergedCandidates
      ? new Map(buildCitations(mergedCandidates).map((c) => [c.source.entryId, c]))
      : undefined;

    // Build conflict hints from store data (CONFLICT-02)
    const conflictHints = enrichMatchesWithConflicts(
      scoredEntries.map((e) => ({ entryId: e.entry.id })),
      data,
      { teamId: auth.activeTeamId, requiredLevel: auth.securityLevel },
    );

    // Assemble response buckets with citations
    const { globalConstraints, projectKnowledge } = await timedStep(
      'assembly',
      () => Promise.resolve(assembleResponseBuckets(scoredEntries, parsed.filters, citations, conflictHints)),
      steps,
    );

    // Generate summary if requested and citations are available
    // Summary only works when we have citations (hybrid or graph-assisted modes)
    const allMatches = [...globalConstraints, ...projectKnowledge];
    const summaryCitations = citations ? Array.from(citations.values()) : undefined;
    const summary =
      parsed.includeSummary && summaryCitations && summaryCitations.length > 0
        ? await timedStep(
            'summary',
            () =>
              Promise.resolve(
                buildSummary({
                  query: parsed.seed,
                  includeSummary: true,
                  hits: allMatches.map((m) => ({
                    shortcut: m.shortcut,
                    detail: m.detail,
                    labels: m.labels,
                  })),
                  citations: summaryCitations,
                }),
              ),
            steps,
          )
        : null;

    // Generate refinement summary if requested and available
    const refinementSummary = parsed.includeRefinement
      ? await timedStep(
          'refinement',
          () => generateRefinement(services, parsed.seed, globalConstraints, projectKnowledge),
          steps,
        )
      : null;

    const result = buildRetrievalResponse(
      globalConstraints,
      projectKnowledge,
      refinementSummary,
      summary,
    );

    // Log RAG retrieval (fire-and-forget) with routing trace
    void logRagRetrieval(services.config.ragLog, {
      timestamp: new Date(startMs).toISOString(),
      queryId,
      seed: parsed.seed,
      mode: parsed.mode,
      actorId: auth.actorId,
      teamId: auth.activeTeamId,
      pipelineSteps: steps,
      totalLatencyMs: Date.now() - startMs,
      resultCount: globalConstraints.length + projectKnowledge.length,
      metadata: {
        filters: parsed.filters,
        maxResults: parsed.maxResults,
        includeSummary: parsed.includeSummary ?? false,
        includeRefinement: parsed.includeRefinement ?? false,
        routingTrace: toRoutingTrace(routingDecision),
      },
    });

    return result;
  } catch (error) {
    // Log failed retrieval attempt with routing trace
    const failRouting = selectRetrievalStrategy(query.mode ?? 'semantic', query.seed ?? '');
    void logRagRetrieval(services.config.ragLog, {
      timestamp: new Date(startMs).toISOString(),
      queryId,
      seed: query.seed ?? '',
      mode: query.mode ?? 'semantic',
      actorId: auth.actorId,
      teamId: auth.activeTeamId,
      pipelineSteps: steps,
      totalLatencyMs: Date.now() - startMs,
      resultCount: 0,
      metadata: {
        filters: query.filters,
        maxResults: query.maxResults ?? 10,
        includeSummary: query.includeSummary ?? false,
        includeRefinement: query.includeRefinement ?? false,
        routingTrace: toRoutingTrace(failRouting),
      },
    });
    throw error;
  }
}

/**
 * Infer routing channels from merged candidates after recall execution.
 * Extracts the set of channels that actually contributed to results.
 *
 * @param mergedCandidates - Merged candidates from recall (may be undefined for semantic-only)
 * @returns Array of channels that contributed to the result set
 */
function inferChannelsFromMerged(mergedCandidates?: MergedCandidate[]): RoutingChannel[] {
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
async function dispatchByMode(
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
      // This should never happen due to Zod validation, but we handle it for safety
      throw new AppError(
        400,
        'invalid_mode',
        `Invalid query mode: ${mode}. Must be one of: semantic, hybrid, graph-assisted`,
      );
  }
}

/**
 * Semantic recall using embeddings.
 * This is the current default retrieval path.
 *
 * When DB search is enabled and PostgreSQL pool is available, uses
 * vectorSimilaritySearch() for O(log n) indexed search instead of
 * O(n) in-memory computation.
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @param services - Server services for DB search configuration
 * @param auth - Auth context for access control filters
 * @returns Scored entries sorted by relevance
 */
async function semanticRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates?: MergedCandidate[] }> {
  // Check if DB search is enabled
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };

  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      // Use DB-level vector search for O(log n) indexed retrieval
      const queryVector = await getQueryEmbedding(seed);
      const dbResults = await vectorSimilaritySearch(dbConfig.pool, {
        queryVector,
        limit: parsed.maxResults * 2, // Get extra for reranking
        teamId: auth.activeTeamId,
        maxLevel: auth.securityLevel,
        scope: parsed.filters?.scope,
      });

      // Convert DB results to scored entries
      // Filter to only include entries that are in eligibleEntries
      const eligibleIds = new Set(eligibleEntries.map((e) => e.id));
      const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));

      const scoredEntries: ScoredEntry[] = [];
      for (const result of dbResults) {
        if (!eligibleIds.has(result.entryId)) continue;

        const entry = entryMap.get(result.entryId);
        if (!entry) continue;

        // Apply boundary scoring if context provided
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

      // Sort by score descending and take top results
      scoredEntries.sort((a, b) => b.score - a.score);
      return { scoredEntries: scoredEntries.slice(0, parsed.maxResults) };
    } catch (error) {
      // Log DB search failure and fall back to in-memory
      console.error('[semanticRecall] DB search failed, falling back to in-memory:', error);
      // Fall through to in-memory implementation
    }
  }

  // In-memory fallback: Generate query embedding
  const queryVector = await getQueryEmbedding(seed);

  // Compute embeddings and scores for all eligible entries with graceful error handling
  const scoredEntries = (
    await Promise.all(
      eligibleEntries.map(async (entry) => {
        try {
          const entryVector = await semanticGetEntryEmbedding(entry);
          const similarity = cosineSimilarity(queryVector, entryVector);
          const score = computeScore(similarity, entry, parsed.filters);
          // Apply boundary scoring if context provided (BOUND-04, BOUND-05)
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
        } catch (error) {
          // Log error and skip this entry - graceful degradation
          console.error(`Failed to get embedding for entry ${entry.id}:`, error);
          return null;
        }
      }),
    )
  ).filter((result): result is ScoredEntry => result !== null);

  // Sort by score descending
  scoredEntries.sort((a, b) => b.score - a.score);

  // Take top maxResults
  // Note: Score threshold is not applied here because fallback embeddings
  // produce uniform scores. Filtering should be done at recall stage.
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
 *
 * When DB search is enabled, uses vectorSimilaritySearch() and pg-keyword
 * for O(log n) indexed retrieval instead of O(n) in-memory computation.
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @param services - Server services for DB search configuration
 * @param auth - Auth context for access control filters
 * @returns Scored entries sorted by combined relevance, plus merged candidates for citations
 */
async function hybridRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates: MergedCandidate[] }> {
  // Normalize query tokens for rerank stage
  const queryTokens = normalizeQuery(seed);

  // Check if DB search is enabled
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };

  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      // Use DB-level search for both channels
      const eligibleIds = new Set(eligibleEntries.map((e) => e.id));
      const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));

      // Create pg-keyword recall function
      const pgKeywordRecall = createPgKeywordRecall({
        pool: dbConfig.pool,
        featureFlag: () => true,
      });

      // Run both DB channels in parallel
      const [queryVector, keywordResults] = await Promise.all([
        getQueryEmbedding(seed),
        pgKeywordRecall(seed, {
          teamId: auth.activeTeamId,
          securityLevel: auth.securityLevel,
          isSystemAdmin: auth.subjectType === 'system-admin',
          scopes: parsed.filters?.scope ? [parsed.filters.scope] : ['global', 'project'],
        }, parsed.maxResults * 2),
      ]);

      // Run DB vector search
      const dbVectorResults = await vectorSimilaritySearch(dbConfig.pool, {
        queryVector,
        limit: parsed.maxResults * 2,
        teamId: auth.activeTeamId,
        maxLevel: auth.securityLevel,
        scope: parsed.filters?.scope,
      });

      // Convert DB vector results to semantic candidates
      const semanticCandidates = dbVectorResults
        .filter((r) => eligibleIds.has(r.entryId))
        .map((r) => {
          const entry = entryMap.get(r.entryId);
          if (!entry) return null;
          return createSemanticCandidate(entry, r.similarity);
        })
        .filter((c): c is NonNullable<ReturnType<typeof createSemanticCandidate>> => c !== null);

      // Convert DB keyword results to RecallCandidate format
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
        .filter((c): c is NonNullable<Awaited<ReturnType<typeof keywordRecall>>[number]> => c !== null);

      // Merge candidates from both channels
      const mergedCandidates = mergeCandidates(semanticCandidates, keywordCandidates);

      // Rerank merged candidates using heuristic boosts
      const rerankedCandidates = rerankCandidates(mergedCandidates, queryTokens, {
        maxCandidates: parsed.maxResults,
        ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
        freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
      });

      // Convert to scored entries for assembly
      const scoredEntries = toScoredEntriesFromReranked(rerankedCandidates);

      return { scoredEntries, mergedCandidates: rerankedCandidates };
    } catch (error) {
      // Log DB search failure and fall back to in-memory
      console.error('[hybridRecall] DB search failed, falling back to in-memory:', error);
      // Fall through to in-memory implementation
    }
  }

  // In-memory fallback: Run both channels in parallel
  const [semanticCandidates, keywordCandidates] = await Promise.all([
    // Semantic channel: compute embeddings and scores
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    // Keyword channel: lexical matching
    keywordRecall(seed, eligibleEntries),
  ]);

  // Merge candidates from both channels (no limit yet - rerank first)
  const mergedCandidates = mergeCandidates(semanticCandidates, keywordCandidates);

  // Rerank merged candidates using heuristic boosts
  const rerankedCandidates = rerankCandidates(mergedCandidates, queryTokens, {
    maxCandidates: parsed.maxResults,
    ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
    freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
  });

  // Convert to scored entries for assembly
  const scoredEntries = toScoredEntriesFromReranked(rerankedCandidates);

  return { scoredEntries, mergedCandidates: rerankedCandidates };
}

/**
 * Compute semantic candidates for hybrid recall.
 * Returns RecallCandidate[] for merge compatibility.
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param filters - Query filters for score boosting
 * @returns Semantic recall candidates
 */
async function computeSemanticCandidates(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
): Promise<ReturnType<typeof createSemanticCandidate>[]> {
  const queryVector = await getQueryEmbedding(seed);

  // Compute candidates with graceful error handling for embedding failures
  const candidates = (
    await Promise.all(
      eligibleEntries.map(async (entry) => {
        try {
          const entryVector = await semanticGetEntryEmbedding(entry);
          const similarity = cosineSimilarity(queryVector, entryVector);
          const score = computeScore(similarity, entry, filters);
          return createSemanticCandidate(entry, score);
        } catch (error) {
          // Log error and skip this entry - graceful degradation
          console.error(`Failed to get embedding for entry ${entry.id}:`, error);
          return null;
        }
      }),
    )
  ).filter(
    (result): result is NonNullable<ReturnType<typeof createSemanticCandidate>> => result !== null,
  );

  // Sort by score descending for deterministic ordering
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * Graph-assisted recall combining hybrid baseline with graph expansion.
 *
 * Pipeline:
 * 1. Run hybrid recall (semantic + keyword) as baseline
 * 2. Run graph-assisted recall for relationship-based expansion
 * 3. Merge graph candidates with hybrid candidates
 * 4. Rerank combined candidates using heuristic boosts
 * 5. Return scored entries sorted by final score
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @returns Scored entries sorted by combined relevance, plus merged candidates for citations
 */
async function graphAssistedRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): Promise<{ scoredEntries: ScoredEntry[]; mergedCandidates: MergedCandidate[] }> {
  // Normalize query tokens for rerank stage
  const queryTokens = normalizeQuery(seed);

  // Convert eligible entries array to Map for graph recall
  const eligibleEntriesMap = new Map<string, KnowledgeRecord>();
  for (const entry of eligibleEntries) {
    eligibleEntriesMap.set(entry.id, entry);
  }

  // Run hybrid baseline and graph recall in parallel
  const [semanticCandidates, keywordCandidates, graphCandidates] = await Promise.all([
    // Semantic channel: compute embeddings and scores
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    // Keyword channel: lexical matching
    keywordRecall(seed, eligibleEntries),
    // Graph channel: relationship-based expansion
    graphRecall(seed, eligibleEntriesMap),
  ]);

  // Merge semantic and keyword candidates first
  const hybridMerged = mergeCandidates(semanticCandidates, keywordCandidates);

  // Now merge graph candidates with hybrid results
  // We need to extend mergeCandidates to handle graph channel
  const finalMerged = mergeCandidatesWithGraph(hybridMerged, graphCandidates);

  // Rerank merged candidates using heuristic boosts
  const rerankedCandidates = rerankCandidates(finalMerged, queryTokens, {
    maxCandidates: parsed.maxResults,
    ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
    freshnessConfig: DEFAULT_FRESHNESS_CONFIG,
  });

  // Convert to scored entries for assembly
  const scoredEntries = toScoredEntriesFromReranked(rerankedCandidates);

  return { scoredEntries, mergedCandidates: rerankedCandidates };
}

/**
 * Merge graph candidates with hybrid candidates.
 * Extends the merge logic to support graph channel evidence.
 *
 * @param hybridMerged - Already-merged semantic + keyword candidates
 * @param graphCandidates - Graph recall candidates
 * @returns Merged candidates with graph evidence included
 */
function mergeCandidatesWithGraph(
  hybridMerged: ReturnType<typeof mergeCandidates>,
  graphCandidates: Awaited<ReturnType<typeof graphRecall>>,
): MergedCandidate[] {
  const result = [...hybridMerged];

  for (const graphCandidate of graphCandidates) {
    const existing = result.find((c) => c.entry.id === graphCandidate.entry.id);

    if (existing) {
      // Entry exists from hybrid - add graph evidence
      // Note: existing is guaranteed non-null by the if-check above (CR-02)
      existing.channels.push('graph');
      existing.graphScore = graphCandidate.score;
      // Preserve pre-rerank score and boost final score based on graph evidence
      const preRerankScore = existing.combinedScore;
      const finalScore = Math.min(
        1,
        preRerankScore + graphCandidate.score * GRAPH_SCORE_BOOST_FACTOR,
      );
      existing.combinedScore = finalScore;
      existing.preRerankScore = preRerankScore;
      existing.finalScore = finalScore;
    } else {
      // Entry only from graph channel
      const score = graphCandidate.score;
      result.push({
        entry: graphCandidate.entry,
        semanticScore: 0,
        keywordScore: 0,
        graphScore: graphCandidate.score,
        combinedScore: score,
        tokenMatches: [],
        channels: ['graph'],
        preRerankScore: score,
        finalScore: score,
      });
    }
  }

  // Re-sort by combined score
  result.sort((a, b) => b.combinedScore - a.combinedScore);

  return result;
}

/**
 * Check if a refinement provider is configured.
 * Returns true if a chat model is available for refinement.
 */
function isRefinementAvailable(services: SkillShareerServices): boolean {
  return services.ai.chat.isConfigured;
}

/**
 * Build a refinement prompt from search results.
 */
function buildRefinementPrompt(
  query: string,
  globalConstraints: unknown[],
  projectKnowledge: unknown[],
): string {
  const parts: string[] = [];
  for (const item of globalConstraints) {
    const m = item as { shortcut?: string; detail?: string };
    parts.push(`- [Global Constraint] ${m.shortcut ?? ''}: ${m.detail ?? ''}`);
  }
  for (const item of projectKnowledge) {
    const m = item as { shortcut?: string; detail?: string };
    parts.push(`- [Project Knowledge] ${m.shortcut ?? ''}: ${m.detail ?? ''}`);
  }
  return `Search results for "${query}":\n${parts.join('\n')}`;
}

/**
 * Generate a refinement summary for search results.
 * This is best-effort: returns null if no provider is configured.
 *
 * @param services - Server services (for AI chat provider)
 * @param query - The original search query
 * @param globalConstraints - Matched global constraints
 * @param projectKnowledge - Matched project knowledge
 * @returns A summary string or null if refinement is unavailable
 */
async function generateRefinement(
  services: SkillShareerServices,
  query: string,
  globalConstraints: unknown[],
  projectKnowledge: unknown[],
): Promise<string | null> {
  // Best-effort: only refine if a provider is configured
  if (!isRefinementAvailable(services)) {
    return null;
  }

  // If we have no matches, return null (nothing to refine)
  if (globalConstraints.length === 0 && projectKnowledge.length === 0) {
    return null;
  }

  try {
    return await services.ai.chat.invoke(
      'You are a knowledge refinement assistant. Given search results, produce a concise summary that highlights the most relevant information. Keep the summary under 3 sentences.',
      buildRefinementPrompt(query, globalConstraints, projectKnowledge),
    );
  } catch {
    // Graceful degradation: if LLM call fails, return null
    return null;
  }
}

/**
 * Update the embedding cache for a knowledge entry.
 * Should be called when an entry is approved or its searchable content changes.
 */
export async function updateEntryEmbeddingCache(
  services: SkillShareerServices,
  entryId: string,
): Promise<void> {
  await services.store.transact(async (data) => {
    const entry = data.knowledgeEntries.find((e) => e.id === entryId);
    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    const text = buildEmbeddingText(entry);
    const textHash = hashEmbeddingText(text);
    const vector = await generateEmbedding(text);

    entry.embeddingCache = {
      textHash,
      vector,
      createdAt: nowIso(),
      revision: entry.history.length,
    };
    entry.updatedAt = nowIso();
  });
}

// =============================================================================
// Phase 14 v2 Retrieval: Capsule-native recall (RETR-03, CAPS-04)
// Server-side capsule ranking from governed artifact-derived outputs.
// =============================================================================

/**
 * v2 retrieval pipeline: capsule-native search.
 *
 * Pipeline order (enforced for security):
 * 1. Parse seed intent internally (RETR-02)
 * 2. Get governed artifacts from store snapshot
 * 3. Filter by approval, team, level (T-14-04)
 * 4. Rank capsules against parsed intent (CAPS-04)
 * 5. Assemble v2 response with capsule matches using pure assembly helpers
 * 6. Build activation hints from governed clientManifest (T-15-02)
 * 7. Optional summary generation over filtered capsule hits (T-14-08)
 *
 * @param services - Server services (config, store)
 * @param auth - Resolved auth context
 * @param query - v2 retrieval query with seed-only input
 * @returns v2 retrieval response with capsule matches
 */
export async function searchKnowledgeV2(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: RetrievalV2Query,
): Promise<RetrievalV2Response> {
  const startMs = Date.now();
  const queryId = generateQueryId();
  const steps: PipelineStep[] = [];

  try {
    // Parse and validate query
    const parsed = await timedStep(
      'parse',
      () => Promise.resolve(retrievalV2QuerySchema.parse(query)),
      steps,
    );

    // Parse seed intent internally (RETR-02)
    const intent = await timedStep(
      'intent',
      () => Promise.resolve(parseSeedIntent(parsed.seed)),
      steps,
    );

    // Resolve routing strategy for v2 (Phase 29)
    const routingDecision = await timedStep(
      'routing',
      () => Promise.resolve(selectRetrievalStrategyV2(parsed.seed)),
      steps,
    );

    // Get current data snapshot
    const data = await timedStep('snapshot', () => services.store.snapshot(), steps);

    // Build governance filters from auth context
    const governanceFilters = {
      teamId: auth.activeTeamId,
      securityLevel: auth.securityLevel,
      isSystemAdmin: auth.subjectType === 'system-admin',
    };

    // Get governed artifacts
    const artifacts = data.skillArtifacts ?? [];

    // Rank capsules against parsed intent (CAPS-04)
    const rankedCandidates = await timedStep(
      'recall',
      () => Promise.resolve(rankCapsules(artifacts, intent, governanceFilters, parsed.maxResults)),
      steps,
    );

    // Update routing channels used from recall results
    routingDecision.channelsUsed = rankedCandidates.length > 0 ? ['capsule'] : [];

    // Early return if no matches
    if (rankedCandidates.length === 0) {
      void logRagRetrieval(services.config.ragLog, {
        timestamp: new Date(startMs).toISOString(),
        queryId,
        seed: parsed.seed,
        mode: 'v2-capsule',
        actorId: auth.actorId,
        teamId: auth.activeTeamId,
        pipelineSteps: steps,
        totalLatencyMs: Date.now() - startMs,
        resultCount: 0,
        metadata: {
          maxResults: parsed.maxResults,
          includeSummary: parsed.includeSummary ?? false,
          includeRefinement: false,
          routingTrace: toRoutingTrace(routingDecision),
        },
      });
      return buildEmptyV2Response();
    }

    // Get full capsule records for response
    const capsuleRecords = await timedStep(
      'assembly',
      () => Promise.resolve(getCapsuleRecords(artifacts, rankedCandidates)),
      steps,
    );

    // Build capsule matches using pure assembly helper (T-14-07)
    const capsules: CapsuleMatch[] = capsuleRecords.map(({ capsule, candidate }) =>
      buildCapsuleMatch(capsule, candidate),
    );

    // Build profile hints from shortlist using pure assembly helper
    const profileShortlist = buildProfileShortlist(artifacts, governanceFilters);
    const artifactIds = new Set(capsules.map((c) => c.artifactId));

    const profileHints: ProfileHint[] = profileShortlist
      .filter(({ artifact }) => artifactIds.has(artifact.id))
      .map(({ artifact }) => buildProfileHint(artifact));

    // Build activation hints from governed clientManifest (T-15-02)
    // Per T-15-01: Activation hints are metadata-only without file bodies
    const activationHints = buildAllActivationHints(capsules, artifacts);

    // Build v2 summary if requested and capsules exist (T-30-02-01)
    // Per T-30-02-02: Citations derived from already-governed CapsuleMatch records
    const v2Summary =
      parsed.includeSummary && capsules.length > 0
        ? buildCapsuleSummary({
            query: parsed.seed,
            includeSummary: true,
            capsules,
            citations: buildCapsuleCitations(capsules),
          })
        : null;

    const result = buildV2RetrievalResponse(capsules, profileHints, v2Summary, activationHints);

    // Log RAG retrieval (fire-and-forget) with routing trace
    void logRagRetrieval(services.config.ragLog, {
      timestamp: new Date(startMs).toISOString(),
      queryId,
      seed: parsed.seed,
      mode: 'v2-capsule',
      actorId: auth.actorId,
      teamId: auth.activeTeamId,
      pipelineSteps: steps,
      totalLatencyMs: Date.now() - startMs,
      resultCount: capsules.length,
      metadata: {
        maxResults: parsed.maxResults,
        includeSummary: parsed.includeSummary ?? false,
        includeRefinement: false,
        routingTrace: toRoutingTrace(routingDecision),
      },
    });

    return result;
  } catch (error) {
    const failRouting = selectRetrievalStrategyV2(query.seed ?? '');
    void logRagRetrieval(services.config.ragLog, {
      timestamp: new Date(startMs).toISOString(),
      queryId,
      seed: query.seed ?? '',
      mode: 'v2-capsule',
      actorId: auth.actorId,
      teamId: auth.activeTeamId,
      pipelineSteps: steps,
      totalLatencyMs: Date.now() - startMs,
      resultCount: 0,
      metadata: {
        maxResults: query.maxResults ?? 10,
        includeSummary: query.includeSummary ?? false,
        includeRefinement: false,
        routingTrace: toRoutingTrace(failRouting),
      },
    });
    throw error;
  }
}
