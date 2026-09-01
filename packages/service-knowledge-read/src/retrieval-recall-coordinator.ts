import {
  InvocationError,
  buildUnknownModeMessage,
  computeScore,
  createGraphRecallTrace,
  inferChannelsFromMerged,
  versionMatchMultiplier,
} from '@trapmap/backend-core';
import type { ChannelMergePort } from '@trapmap/backend-core';
import type { RetrievalQuery, retrievalQuerySchema } from '@trapmap/contracts';
import type { Pool } from 'pg';
import { type MergedCandidate, type ScoredEntry, artifactVersionOf } from './retrieval-types.js';

import { createRuleChannelMerge } from './channel-merge/rule-channel-merge.js';
import type {
  KnowledgeReadGraphQueryRuntimeState,
  ResolvedAuthContext,
  SkillShareerServices,
} from './context.js';
import { getRetrievalInfra } from './retrieval-infra.js';
import { keywordRecall, normalizeQuery } from './retrieval-keyword.js';
import { getQueryEmbedding, optimizedSemanticRecall } from './retrieval-semantic.js';
import type { KnowledgeRecord } from './store.js';
import { getGoAcceleratorClient } from '@trapmap/infra/go-accelerator/client.js';

export { inferChannelsFromMerged };
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
  backendKind: KnowledgeReadGraphQueryRuntimeState['backendKind'];
  backendMode: KnowledgeReadGraphQueryRuntimeState['mode'];
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

function finalizeSemanticResults(
  infra: NonNullable<ReturnType<typeof getRetrievalInfra>>,
  scoredEntries: ScoredEntry[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): RecallExecutionResult {
  scoredEntries.sort((a, b) => b.score - a.score);
  const sliced = scoredEntries.slice(0, parsed.maxResults);
  const mergedCandidates = infra.scoring.mergeCandidates(
    sliced.map(({ entry, score }) => infra.scoring.createSemanticCandidate(entry, score)),
    [],
  );
  return { scoredEntries: sliced, mergedCandidates };
}

function versionMultiplierFor(
  infra: NonNullable<ReturnType<typeof getRetrievalInfra>>,
  entry: KnowledgeRecord,
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): number {
  return versionMatchMultiplier({
    artifactVersion: artifactVersionOf(entry),
    queryVersions: parsed.boundaryContext?.versions,
    freshnessType: entry.decayMeta?.freshnessType ?? null,
    decayConfig: infra.scoring.freshnessConfig,
  });
}

function toScoredEntry(
  entry: KnowledgeRecord,
  score: number,
  boundaryExplanation?: ScoredEntry['boundaryExplanation'],
): ScoredEntry {
  const scoredEntry: ScoredEntry = { entry, score };
  const version = artifactVersionOf(entry);
  if (version !== undefined) {
    scoredEntry.version = version;
  }
  const revision = entry.latestRevision?.revision;
  if (revision !== undefined) {
    scoredEntry.revision = revision;
  }
  if (boundaryExplanation !== undefined) {
    scoredEntry.boundaryExplanation = boundaryExplanation;
  }
  return scoredEntry;
}

function toGoRankingEntries(candidates: MergedCandidate[]): Array<{
  id: string;
  semanticScore: number;
  keywordScore: number;
  graphScore?: number;
  channelScores: Record<string, number>;
  combinedScore: number;
  tokenMatches: Array<{ token: string; fields: string[] }>;
  channels: string[];
  preRerankScore: number;
  finalScore: number;
  labels: string[];
  scope: string;
  shortcut: string;
  detail: string;
  decayState?: string;
  boundary?: { context?: string[]; exclusions?: Array<{ kind: string; description: string }> };
}> {
  return candidates.map((c) => ({
    id: c.entry.id,
    semanticScore: c.semanticScore,
    keywordScore: c.keywordScore,
    ...(c.graphScore !== undefined ? { graphScore: c.graphScore } : {}),
    channelScores: { ...c.channelScores },
    combinedScore: c.combinedScore,
    tokenMatches: c.tokenMatches.map((tm) => ({ token: tm.token, fields: [...tm.fields] })),
    channels: [...c.channels],
    preRerankScore: c.preRerankScore,
    finalScore: c.finalScore,
    labels: [...c.entry.labels],
    scope: c.entry.scope,
    shortcut: c.entry.shortcut,
    detail: c.entry.detail,
    ...(c.entry.boundary
      ? {
          boundary: {
            ...(c.entry.boundary.context ? { context: [...c.entry.boundary.context] } : {}),
            ...(c.entry.boundary.exclusions
              ? {
                  exclusions: c.entry.boundary.exclusions.map((e) => ({
                    kind: e.kind ?? 'other',
                    description: e.description,
                  })),
                }
              : {}),
          },
        }
      : {}),
    ...(c.entry.decayMeta?.freshnessType ? { decayState: c.entry.decayMeta.freshnessType } : {}),
  }));
}

function fromGoRankingEntries(
  goEntries: Array<{
    id: string;
    semanticScore: number;
    keywordScore: number;
    graphScore?: number;
    channelScores: Record<string, number>;
    combinedScore: number;
    tokenMatches: Array<{ token: string; fields: string[] }>;
    channels: string[];
    preRerankScore: number;
    finalScore: number;
    boundaryScoreDelta?: number;
    decayMultiplier?: number;
  }>,
  entryMap: Map<string, KnowledgeRecord>,
  originalMap: Map<string, MergedCandidate>,
): MergedCandidate[] {
  const out: MergedCandidate[] = [];
  for (const ge of goEntries) {
    const entry = entryMap.get(ge.id);
    const orig = originalMap.get(ge.id);
    if (!entry || !orig) continue;
    out.push({
      entry,
      semanticScore: ge.semanticScore,
      keywordScore: ge.keywordScore,
      ...(ge.graphScore !== undefined ? { graphScore: ge.graphScore } : {}),
      channelScores: ge.channelScores,
      combinedScore: ge.combinedScore,
      tokenMatches: ge.tokenMatches as MergedCandidate['tokenMatches'],
      channels: ge.channels,
      preRerankScore: ge.preRerankScore,
      finalScore: ge.finalScore,
      ...(ge.boundaryScoreDelta !== undefined ? { boundaryScoreDelta: ge.boundaryScoreDelta } : {}),
      ...(ge.decayMultiplier !== undefined ? { decayMultiplier: ge.decayMultiplier } : {}),
      ...(orig.version !== undefined ? { version: orig.version } : {}),
      ...(orig.revision !== undefined ? { revision: orig.revision } : {}),
      ...(orig.boundaryExplanation !== undefined
        ? { boundaryExplanation: orig.boundaryExplanation }
        : {}),
    });
  }
  return out;
}

async function rerankRecallResults(
  infra: NonNullable<ReturnType<typeof getRetrievalInfra>>,
  mergedCandidates: MergedCandidate[],
  queryTokens: ReturnType<typeof normalizeQuery>,
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): Promise<RecallExecutionResult> {
  const localFallback = (): MergedCandidate[] =>
    infra.scoring.rerankCandidates(mergedCandidates, queryTokens, {
      maxCandidates: parsed.maxResults,
      ...(parsed.boundaryContext !== undefined && { boundaryContext: parsed.boundaryContext }),
      freshnessConfig: infra.scoring.freshnessConfig,
      earlyTerminationThreshold: 0.3,
    });

  if (mergedCandidates.length === 0) {
    const reranked = localFallback();
    return {
      scoredEntries: infra.scoring.toScoredEntriesFromReranked(reranked),
      mergedCandidates: reranked,
    };
  }

  const goClient = getGoAcceleratorClient();
  if (goClient.isEnabled) {
    try {
      const entryMap = new Map<string, KnowledgeRecord>();
      const originalMap = new Map<string, MergedCandidate>();
      for (const c of mergedCandidates) {
        entryMap.set(c.entry.id, c.entry);
        originalMap.set(c.entry.id, c);
      }
      const goEntries = toGoRankingEntries(mergedCandidates);
      let rerankedCandidates: MergedCandidate[] | null = null;
      try {
        const res = await goClient.rankingBatch({
          entries: goEntries,
          queryTokens,
          maxCandidates: parsed.maxResults,
          ...(parsed.boundaryContext
            ? {
                boundaryContext: {
                  contexts: parsed.boundaryContext.contexts ?? [],
                  ...(parsed.boundaryContext.platform
                    ? { platform: parsed.boundaryContext.platform }
                    : {}),
                },
              }
            : {}),
        });
        const merged = (res as any).merged as typeof goEntries;
        if (Array.isArray(merged) && merged.length > 0) {
          const mapped = fromGoRankingEntries(merged as any, entryMap, originalMap);
          if (mapped.length > 0) rerankedCandidates = mapped;
        } else if (Array.isArray(merged)) {
          // Go returned empty (possible), treat as filtered result
          rerankedCandidates = fromGoRankingEntries(merged as any, entryMap, originalMap);
        }
      } catch {
        // Go failed, fall through to local
      }
      if (rerankedCandidates === null) {
        rerankedCandidates = localFallback();
      }
      return {
        scoredEntries: infra.scoring.toScoredEntriesFromReranked(rerankedCandidates),
        mergedCandidates: rerankedCandidates,
      };
    } catch {
      // fall through to local
    }
  }

  const rerankedCandidates = localFallback();
  return {
    scoredEntries: infra.scoring.toScoredEntriesFromReranked(rerankedCandidates),
    mergedCandidates: rerankedCandidates,
  };
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
    throw InvocationError.validation(
      buildUnknownModeMessage(
        mode,
        strategyRegistry.all().map((s) => s.version),
      ),
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
      const queryVector = await getQueryEmbedding(services!, seed);
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

        const boundaryDelta = infra!.scoring.computeBoundaryScoreDelta(
          entry,
          parsed.boundaryContext,
        );
        const boostedScore =
          computeScore(result.similarity, entry, parsed.filters, seed) *
          versionMultiplierFor(infra!, entry, parsed);
        const finalScore = Math.min(1, Math.max(0, boostedScore + boundaryDelta));
        const boundaryExplanation = parsed.boundaryContext
          ? infra!.scoring.buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta)
          : undefined;

        scoredEntries.push(toScoredEntry(entry, finalScore, boundaryExplanation));
      }

      return finalizeSemanticResults(infra!, scoredEntries, parsed);
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
    parsed.boundaryContext?.versions,
  );

  const scoredEntries: ScoredEntry[] = rawScoredEntries.map(({ entry, score }) => {
    const boundaryDelta = infra!.scoring.computeBoundaryScoreDelta(entry, parsed.boundaryContext);
    const finalScore = Math.min(1, Math.max(0, score + boundaryDelta));
    const boundaryExplanation = parsed.boundaryContext
      ? infra!.scoring.buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta)
      : undefined;
    return toScoredEntry(entry, finalScore, boundaryExplanation);
  });

  return finalizeSemanticResults(infra!, scoredEntries, parsed);
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
        getQueryEmbedding(services!, seed),
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

      const createSemanticCandidate = infra!.scoring.createSemanticCandidate;
      const semanticCandidates = dbVectorResults
        .filter((r: (typeof dbVectorResults)[number]) => eligibleIds.has(r.entryId))
        .map((r: (typeof dbVectorResults)[number]) => {
          const entry = entryMap.get(r.entryId);
          if (!entry) return null;
          return createSemanticCandidate(
            entry,
            r.similarity * versionMultiplierFor(infra!, entry, parsed),
          );
        })
        .filter((c): c is NonNullable<ReturnType<typeof createSemanticCandidate>> => c !== null);

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

      const mergedCandidates = infra!.scoring.mergeCandidates(
        semanticCandidates,
        keywordCandidates,
      );
      return await rerankRecallResults(infra!, mergedCandidates, queryTokens, parsed);
    } catch (error) {
      console.error('[hybridRecall] DB search failed, falling back to in-memory:', error);
    }
  }

  const [semanticCandidates, keywordCandidates] = await Promise.all([
    computeSemanticCandidates(
      services!,
      seed,
      eligibleEntries,
      parsed.filters,
      parsed.boundaryContext?.versions,
    ),
    keywordRecall(seed, eligibleEntries),
  ]);

  const mergedCandidates = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
  return await rerankRecallResults(infra!, mergedCandidates, queryTokens, parsed);
}

async function computeSemanticCandidates(
  services: SkillShareerServices,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
  queryVersions?: ReadonlyArray<{ package: string; version: string }> | null,
): Promise<
  ReturnType<ReturnType<typeof getRetrievalInfra>['scoring']['createSemanticCandidate']>[]
> {
  const infra = getRetrievalInfra(services);
  const queryVector = await getQueryEmbedding(services, seed);
  const { scoredEntries } = await optimizedSemanticRecall(
    services,
    queryVector,
    eligibleEntries,
    filters,
    seed,
    queryVersions,
  );
  const candidates = scoredEntries.map(({ entry, score }) =>
    infra.scoring.createSemanticCandidate(entry, score),
  );
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

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
    computeSemanticCandidates(
      services!,
      seed,
      eligibleEntries,
      parsed.filters,
      parsed.boundaryContext?.versions,
    ),
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
      (
        candidate,
      ): candidate is Awaited<
        ReturnType<ReturnType<typeof getRetrievalInfra>['pgRecall']['graphAssistedRecall']>
      >[number] => candidate !== null,
    );

  const hybridMerged = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
  // D8 channel-merge call-site migration: the graph fusion goes through the
  // judgment port (rule default = mergeCandidatesWithGraph, behavior-preserving).
  const channelMerge: ChannelMergePort<KnowledgeRecord> =
    services?.channelMerge ?? createRuleChannelMerge();
  const finalMerged = await channelMerge.merge({
    hybridCandidates: hybridMerged,
    graphCandidates: governedGraphCandidates,
  });

  const reranked = await rerankRecallResults(infra!, finalMerged, queryTokens, parsed);
  return {
    ...reranked,
    trace: {
      graph: createGraphRecallTrace(
        services?.graphQueryBackend?.getRuntimeState() ?? services?.graphQuery,
        governedGraphCandidates.length,
      ),
    },
  };
}
