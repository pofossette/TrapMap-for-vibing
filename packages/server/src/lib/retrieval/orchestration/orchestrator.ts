/**
 * Retrieval orchestrator: thin coordinator for the retrieval pipeline.
 *
 * Routing logic → ./routing.ts
 * Recall dispatch and channel functions → ./recall-coordinator.ts
 * LLM refinement generation → ./refinement.ts
 */

import {
  type CapsuleMatch,
  type ProfileHint,
  type RetrievalQuery,
  type RetrievalResponse,
  type RetrievalV2Query,
  type RetrievalV2Response,
  retrievalQuerySchema,
  retrievalV2QuerySchema,
} from '@trapmap/contracts';

import { enrichMatchesWithConflicts } from '@trapmap/server/lib/conflict/enrich.js';
import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import { generateEmbedding, hashEmbeddingText } from '@trapmap/server/lib/embeddings.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import type { PipelineStep, RagLogEntry } from '@trapmap/server/lib/rag-log.js';
import { generateQueryId, logRagRetrieval } from '@trapmap/server/lib/rag-log.js';
import {
  CapsuleChannelRegistry,
  CapsuleRecallCoordinator,
  buildProfileShortlist,
  getCapsuleRecords,
} from '@trapmap/server/lib/retrieval/capsules/index.js';
import {
  InMemoryIntentCache,
  parseSeedIntentWithLLM,
} from '@trapmap/server/lib/retrieval/capsules/index.js';
import { buildEmbeddingText } from '@trapmap/server/lib/retrieval/recall/semantic.js';
import {
  assembleResponseBuckets,
  buildAllActivationHints,
  buildCapsuleMatch,
  buildEmptyResponse,
  buildEmptyV2Response,
  buildProfileHint,
  buildRetrievalResponse,
  buildV2RetrievalResponse,
} from '@trapmap/server/lib/retrieval/response/assembly.js';
import { buildCitations } from '@trapmap/server/lib/retrieval/response/citations.js';
import { generateRefinement } from '@trapmap/server/lib/retrieval/response/refinement.js';
import {
  buildCapsuleCitations,
  buildCapsuleSummary,
  buildSummary,
} from '@trapmap/server/lib/retrieval/response/summary.js';
import { buildRetrievalReadModel } from '@trapmap/server/lib/retrieval/read-model.js';
import type { ScoredEntry } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord, StoreData } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { filterByBoundaryContext, filterEligibleEntries } from './filters.js';
import { dispatchByMode, inferChannelsFromMerged } from './recall-coordinator.js';
import { selectRetrievalStrategy, selectRetrievalStrategyV2, toRoutingTrace } from './routing.js';

const intentCache = new InMemoryIntentCache();

/**
 * Options for timedStep to record input/output sizes.
 */
interface TimedStepOptions {
  inputSize?: number;
  outputSize?: number | ((result: unknown) => number);
}

/**
 * Time a pipeline step and record its latency.
 * Used to capture detailed timing for RAG logging.
 */
async function timedStep<T>(
  name: string,
  fn: () => Promise<T>,
  steps: PipelineStep[],
  options?: TimedStepOptions,
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  const step: PipelineStep = { name, latencyMs };
  if (options?.inputSize !== undefined) {
    step.inputSize = options.inputSize;
  }
  if (options?.outputSize !== undefined) {
    step.outputSize =
      typeof options.outputSize === 'function' ? options.outputSize(result) : options.outputSize;
  }
  steps.push(step);
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
    const parsed = await timedStep(
      'parse',
      () => Promise.resolve(retrievalQuerySchema.parse(query)),
      steps,
    );

    const readModel = await timedStep('snapshot', () => buildRetrievalReadModel(services.repos, services.store), steps, {
      outputSize: (d) =>
        (d as Awaited<ReturnType<typeof buildRetrievalReadModel>>).knowledgeEntries.length,
    });

    const eligibleEntries = await timedStep(
      'eligibility',
      () => Promise.resolve(filterEligibleEntries(readModel.knowledgeEntries, auth, parsed.filters)),
      steps,
      {
        inputSize: readModel.knowledgeEntries.length,
        outputSize: (r) => (r as KnowledgeRecord[]).length,
      },
    );

    const boundaryFiltered = await timedStep(
      'boundary-filter',
      () => Promise.resolve(filterByBoundaryContext(eligibleEntries, parsed.boundaryContext)),
      steps,
      { inputSize: eligibleEntries.length, outputSize: (r) => (r as KnowledgeRecord[]).length },
    );

    if (boundaryFiltered.length === 0) {
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

    const routingDecision = await timedStep(
      'routing',
      () => Promise.resolve(selectRetrievalStrategy(parsed.mode, parsed.seed)),
      steps,
    );

    const { scoredEntries, mergedCandidates } = await timedStep(
      'recall',
      () =>
        dispatchByMode(
          parsed.mode,
          parsed.seed,
          boundaryFiltered,
          parsed,
          services.strategyRegistry,
          services.channelRegistry,
          services,
          auth,
        ),
      steps,
      {
        inputSize: boundaryFiltered.length,
        outputSize: (r) => (r as { scoredEntries: ScoredEntry[] }).scoredEntries.length,
      },
    );

    routingDecision.channelsUsed = inferChannelsFromMerged(mergedCandidates);

    const citations = mergedCandidates
      ? new Map(buildCitations(mergedCandidates).map((c) => [c.source.entryId, c]))
      : undefined;

    const conflictData = {
      conflicts: readModel.conflicts,
      knowledgeEntries: readModel.knowledgeEntries,
    } as StoreData;
    const conflictHints = enrichMatchesWithConflicts(
      scoredEntries.map((e) => ({ entryId: e.entry.id })),
      conflictData,
      { teamId: auth.activeTeamId, requiredLevel: auth.securityLevel },
    );

    const { globalConstraints, projectKnowledge } = await timedStep(
      'assembly',
      () =>
        Promise.resolve(
          assembleResponseBuckets(scoredEntries, parsed.filters, citations, conflictHints),
        ),
      steps,
      {
        inputSize: scoredEntries.length,
        outputSize: (r) => {
          const ar = r as { globalConstraints: unknown[]; projectKnowledge: unknown[] };
          return ar.globalConstraints.length + ar.projectKnowledge.length;
        },
      },
    );

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
 * Update the embedding cache for a knowledge entry.
 * Should be called when an entry is approved or its searchable content changes.
 */
export async function updateEntryEmbeddingCache(
  services: SkillShareerServices,
  entryId: string,
): Promise<void> {
  const entry = await services.repos.knowledge.getById(entryId);
  if (!entry) {
    throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  }

  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);
  const vector = await generateEmbedding(text);

  await services.repos.knowledge.updateEmbeddingCache(entryId, {
    textHash,
    vector,
    createdAt: nowIso(),
    revision: entry.history.length,
  });
}

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
    const parsed = await timedStep(
      'parse',
      () => Promise.resolve(retrievalV2QuerySchema.parse(query)),
      steps,
    );

    const intent = await timedStep(
      'intent',
      () => parseSeedIntentWithLLM(parsed.seed, services.ai.chat, { cache: intentCache }),
      steps,
    );

    const routingDecision = await timedStep(
      'routing',
      () => Promise.resolve(selectRetrievalStrategyV2(parsed.seed)),
      steps,
    );

    const readModel = await timedStep('snapshot', () => buildRetrievalReadModel(services.repos, services.store), steps, {
      outputSize: (d) =>
        (d as Awaited<ReturnType<typeof buildRetrievalReadModel>>).skillArtifacts.length ?? 0,
    });

    const governanceFilters = {
      teamId: auth.activeTeamId,
      securityLevel: auth.securityLevel,
      isSystemAdmin: auth.subjectType === 'system-admin',
    };

    const artifacts = readModel.skillArtifacts;

    // Phase 5: Create coordinator with heuristic + keyword + semantic + graph channels.
    // Graph channel augments recall via skill artifact graph expansion (one-hop entity
    // traversal) but does not dominate final ranking. Semantic channel provides
    // embedding-based recall for paraphrase/rewording gaps; heuristic channel preserves
    // backward-compatible intent-aware scoring; keyword channel provides independent
    // lexical recall.
    //
    // Keyword and semantic channels support dual-path recall:
    //   - PG path (when RETRIEVAL_CAPSULE_PG_* env var is 'true' and pool is available)
    //   - Memory path (always available as fallback)
    const pgPool = services.store instanceof PostgresStore ? services.store.getPool() : null;

    const channelRegistry = new CapsuleChannelRegistry();
    const { capsuleHeuristicChannel } = await import(
      '@trapmap/server/lib/retrieval/capsules/channels/heuristic.js'
    );
    const { createCapsuleKeywordChannel } = await import(
      '@trapmap/server/lib/retrieval/capsules/channels/keyword.js'
    );
    const { createCapsuleSemanticChannel } = await import(
      '@trapmap/server/lib/retrieval/capsules/channels/semantic.js'
    );
    channelRegistry.register(capsuleHeuristicChannel);
    channelRegistry.register(
      createCapsuleKeywordChannel(
        pgPool
          ? {
              pgPool,
              pgFeatureFlag: () => process.env.RETRIEVAL_CAPSULE_PG_KEYWORD === 'true',
            }
          : undefined,
      ),
    );
    channelRegistry.register(
      createCapsuleSemanticChannel(
        pgPool
          ? {
              pgPool,
              pgFeatureFlag: () => process.env.RETRIEVAL_CAPSULE_PG_SEMANTIC === 'true',
            }
          : undefined,
      ),
    );
    // Graph channel uses a factory function because it requires GraphIndexRepository.
    // Register after keyword/semantic so it supplements recall without dominating.
    try {
      const { createCapsuleGraphChannel } = await import(
        '@trapmap/server/lib/retrieval/capsules/channels/graph.js'
      );
      channelRegistry.register(createCapsuleGraphChannel(services.repos.graphIndex));
    } catch {
      // Graph channel registration failure should not block retrieval.
    }
    const coordinator = new CapsuleRecallCoordinator(channelRegistry);

    const recallResult = await timedStep(
      'recall',
      () =>
        coordinator.execute({
          artifacts,
          intent,
          governanceFilters,
          maxResults: parsed.maxResults,
        }),
      steps,
      {
        inputSize: artifacts.length,
        outputSize: (r) => (r as { capsuleCandidates: unknown[] }).capsuleCandidates.length,
      },
    );

    const rankedCandidates = recallResult.capsuleCandidates;

    routingDecision.channelsPlanned = recallResult.channelsPlanned;
    routingDecision.channelsUsed = recallResult.channelsUsed;

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

    const capsuleRecords = await timedStep(
      'assembly',
      () => Promise.resolve(getCapsuleRecords(artifacts, rankedCandidates)),
      steps,
    );

    const capsules: CapsuleMatch[] = capsuleRecords.map(({ capsule, candidate }) =>
      buildCapsuleMatch(capsule, candidate),
    );

    const profileShortlist = buildProfileShortlist(artifacts, governanceFilters);
    const artifactIds = new Set(capsules.map((c) => c.artifactId));

    const profileHints: ProfileHint[] = profileShortlist
      .filter(({ artifact }) => artifactIds.has(artifact.id))
      .map(({ artifact }) => buildProfileHint(artifact));

    const activationHints = buildAllActivationHints(capsules, artifacts);

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
        mergeStats: recallResult.mergeStats,
        channelsFailed: recallResult.channelsFailed,
        parseMethod: intent.parseMethod,
        intentCategory: intent.category,
      },
    } as RagLogEntry);

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
