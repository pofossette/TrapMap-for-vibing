import type { RetrievalQuery, retrievalQuerySchema } from '@trapmap/contracts';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { GraphQueryRuntimeState } from '@trapmap/server/lib/graph-query/index.js';
import type { Pool } from 'pg';
import type { MergedCandidate, RoutingChannel, ScoredEntry } from './retrieval-types.js';

import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { getRetrievalInfra } from './retrieval-infra.js';
import { keywordRecall, normalizeQuery } from './retrieval-keyword.js';
import { computeScore, getQueryEmbedding, optimizedSemanticRecall } from './retrieval-semantic.js';
import type { KnowledgeRecord } from './store.js';

interface RetrievalStrategyLike {
  readonly version: string;
  execute(
    query: ReturnType<typeof retrievalQuerySchema.parse>,
    channels: unknown,
    eligibleEntries: KnowledgeRecord[],
    services?: SkillShareerServices,
    auth?: ResolvedAuthContext,
  ): Promise<RecallExecutionResult>;
}

interface StrategyRegistryLike {
  get(version: string): RetrievalStrategyLike | undefined;
  all(): Array<Pick<RetrievalStrategyLike, 'version'>>;
}

interface ChannelRegistryLike {
  get(name: string): unknown;
  all(): unknown[];
}

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

export function getDbSearchConfig(services: SkillShareerServices): DbSearchConfig {
  const infra = getRetrievalInfra(services);
  const enabled = infra.pgRecall.isEnabled();
  const pool = infra.pgRecall.getPool(services.store);
  return { enabled: enabled && pool !== null, pool };
}

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

export async function dispatchByMode(
  mode: string,
  _seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  strategyRegistry: StrategyRegistryLike,
  channelRegistry: ChannelRegistryLike,
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

export async function semanticRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const infra = services ? getRetrievalInfra(services) : null;
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };

  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      const queryVector = await getQueryEmbedding(services, seed);
      const scopeFilter =
        parsed.filters?.scopes?.length === 1 ? parsed.filters.scopes[0] : undefined;
      const dbResults = await infra!.pgRecall.vectorSimilaritySearch(dbConfig.pool, {
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

        const boundaryDelta = infra!.scoring.computeBoundaryScoreDelta(entry, parsed.boundaryContext);
        const boostedScore = computeScore(result.similarity, entry, parsed.filters, seed);
        const finalScore = Math.min(1, Math.max(0, boostedScore + boundaryDelta));
        const boundaryExplanation = parsed.boundaryContext
          ? infra!.scoring.buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta)
          : undefined;

        const scoredEntry: ScoredEntry = { entry, score: finalScore };
        if (boundaryExplanation !== undefined) {
          scoredEntry.boundaryExplanation = boundaryExplanation;
        }
        scoredEntries.push(scoredEntry);
      }

      scoredEntries.sort((a, b) => b.score - a.score);
      const sliced = scoredEntries.slice(0, parsed.maxResults);
      const mergedCandidates = infra!.scoring.mergeCandidates(
        sliced.map(({ entry, score }) => infra!.scoring.createSemanticCandidate(entry, score)),
        [],
      );
      return { scoredEntries: sliced, mergedCandidates };
    } catch (error) {
      console.error('[semanticRecall] DB search failed, falling back to in-memory:', error);
    }
  }

  const queryVector = await getQueryEmbedding(services!, seed);
  const { scoredEntries: rawScoredEntries } = await optimizedSemanticRecall(
    services!,
    queryVector,
    eligibleEntries,
    parsed.filters,
    seed,
  );

  const scoredEntries: ScoredEntry[] = rawScoredEntries.map(({ entry, score }) => {
    const boundaryDelta = infra!.scoring.computeBoundaryScoreDelta(entry, parsed.boundaryContext);
    const finalScore = Math.min(1, Math.max(0, score + boundaryDelta));
    const boundaryExplanation = parsed.boundaryContext
      ? infra!.scoring.buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta)
      : undefined;
    const result: ScoredEntry = { entry, score: finalScore };
    if (boundaryExplanation !== undefined) {
      result.boundaryExplanation = boundaryExplanation;
    }
    return result;
  });

  scoredEntries.sort((a, b) => b.score - a.score);
  const sliced = scoredEntries.slice(0, parsed.maxResults);
  const mergedCandidates = infra!.scoring.mergeCandidates(
    sliced.map(({ entry, score }) => infra!.scoring.createSemanticCandidate(entry, score)),
    [],
  );
  return { scoredEntries: sliced, mergedCandidates };
}

export async function hybridRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const queryTokens = normalizeQuery(seed);
  const infra = services ? getRetrievalInfra(services) : null;
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };

  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      const eligibleIds = new Set(eligibleEntries.map((e) => e.id));
      const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));

      const [queryVector, keywordResults] = await Promise.all([
        getQueryEmbedding(services, seed),
        infra!.pgRecall.keywordRecall(
          dbConfig.pool,
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
      const dbVectorResults = await infra!.pgRecall.vectorSimilaritySearch(dbConfig.pool, {
        queryVector,
        limit: parsed.maxResults * 2,
        teamId: auth.activeTeamId,
        maxLevel: auth.securityLevel,
        ...(dbScopeFilter ? { scope: dbScopeFilter } : {}),
      });

      const semanticCandidates = dbVectorResults
        .filter((r: (typeof dbVectorResults)[number]) => eligibleIds.has(r.entryId))
        .map((r: (typeof dbVectorResults)[number]) => {
          const entry = entryMap.get(r.entryId);
          if (!entry) return null;
          return infra!.scoring.createSemanticCandidate(entry, r.similarity);
        })
        .filter((c): c is NonNullable<ReturnType<typeof infra!.scoring.createSemanticCandidate>> => c !== null);

      const keywordCandidates: Awaited<ReturnType<typeof keywordRecall>> = [];
      for (const result of keywordResults) {
        if (!eligibleIds.has(result.entryId)) {
          continue;
        }
        const entry = entryMap.get(result.entryId);
        if (!entry) {
          continue;
        }
        keywordCandidates.push({
          entry,
          channel: 'keyword',
          score: result.score,
          tokenMatches: result.tokenMatches,
        });
      }

      const mergedCandidates = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
      const rerankedCandidates = infra!.scoring.rerankCandidates(mergedCandidates, queryTokens, {
        maxCandidates: parsed.maxResults,
        ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
        freshnessConfig: infra!.scoring.freshnessConfig,
        earlyTerminationThreshold: 0.3,
      });

      const scoredEntries = infra!.scoring.toScoredEntriesFromReranked(rerankedCandidates);
      return { scoredEntries, mergedCandidates: rerankedCandidates };
    } catch (error) {
      console.error('[hybridRecall] DB search failed, falling back to in-memory:', error);
    }
  }

  const [semanticCandidates, keywordCandidates] = await Promise.all([
    computeSemanticCandidates(services!, seed, eligibleEntries, parsed.filters),
    keywordRecall(seed, eligibleEntries),
  ]);

  const mergedCandidates = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
  const rerankedCandidates = infra!.scoring.rerankCandidates(mergedCandidates, queryTokens, {
    maxCandidates: parsed.maxResults,
    ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
    freshnessConfig: infra!.scoring.freshnessConfig,
    earlyTerminationThreshold: 0.3,
  });

  const scoredEntries = infra!.scoring.toScoredEntriesFromReranked(rerankedCandidates);
  return { scoredEntries, mergedCandidates: rerankedCandidates };
}

async function computeSemanticCandidates(
  services: SkillShareerServices,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
): Promise<ReturnType<ReturnType<typeof getRetrievalInfra>['scoring']['createSemanticCandidate']>[]> {
  const infra = getRetrievalInfra(services);
  const queryVector = await getQueryEmbedding(services, seed);
  const { scoredEntries } = await optimizedSemanticRecall(
    services,
    queryVector,
    eligibleEntries,
    filters,
    seed,
  );
  const candidates = scoredEntries.map(({ entry, score }) =>
    infra.scoring.createSemanticCandidate(entry, score),
  );
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

const GRAPH_SCORE_BOOST_FACTOR = 0.2;

export async function graphAssistedHybridRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
): Promise<RecallExecutionResult> {
  const queryTokens = normalizeQuery(seed);
  const infra = services ? getRetrievalInfra(services) : null;
  const eligibleEntriesMap = new Map<string, KnowledgeRecord>();
  for (const entry of eligibleEntries) {
    eligibleEntriesMap.set(entry.id, entry);
  }

  const [semanticCandidates, keywordCandidates, graphCandidates] = await Promise.all([
    computeSemanticCandidates(services!, seed, eligibleEntries, parsed.filters),
    keywordRecall(seed, eligibleEntries),
    infra!.pgRecall.graphAssistedRecall(
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
      (candidate): candidate is Awaited<ReturnType<ReturnType<typeof getRetrievalInfra>['pgRecall']['graphAssistedRecall']>>[number] =>
        candidate !== null,
    );

  const hybridMerged = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
  const finalMerged = mergeCandidatesWithGraph(hybridMerged, governedGraphCandidates);

  const rerankedCandidates = infra!.scoring.rerankCandidates(finalMerged, queryTokens, {
    maxCandidates: parsed.maxResults,
    ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
    freshnessConfig: infra!.scoring.freshnessConfig,
    earlyTerminationThreshold: 0.3,
  });

  const scoredEntries = infra!.scoring.toScoredEntriesFromReranked(rerankedCandidates);
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

function mergeCandidatesWithGraph(
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
