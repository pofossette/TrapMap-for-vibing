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

import { enrichMatchesWithConflicts } from '../../conflict/enrich.js';
import type { ResolvedAuthContext, SkillShareerServices } from '../../context.js';
import { generateEmbedding, hashEmbeddingText } from '../../embeddings.js';
import { AppError } from '../../errors.js';
import type { PipelineStep } from '../../rag-log.js';
import { generateQueryId, logRagRetrieval } from '../../rag-log.js';
import type { KnowledgeRecord } from '../../store.js';
import { nowIso } from '../../store.js';
import {
  CapsuleChannelRegistry,
  CapsuleRecallCoordinator,
  buildProfileShortlist,
  getCapsuleRecords,
  rankCapsules,
} from '../capsules/index.js';
import { parseSeedIntent } from '../capsules/intent.js';
import { buildEmbeddingText } from '../recall/semantic.js';
import {
  assembleResponseBuckets,
  buildAllActivationHints,
  buildCapsuleMatch,
  buildEmptyResponse,
  buildEmptyV2Response,
  buildProfileHint,
  buildRetrievalResponse,
  buildV2RetrievalResponse,
} from '../response/assembly.js';
import { buildCitations } from '../response/citations.js';
import { generateRefinement } from '../response/refinement.js';
import { buildCapsuleCitations, buildCapsuleSummary, buildSummary } from '../response/summary.js';
import type { ScoredEntry } from '../types.js';
import { filterByBoundaryContext, filterEligibleEntries } from './filters.js';
import { dispatchByMode, inferChannelsFromMerged } from './recall-coordinator.js';
import { selectRetrievalStrategy, selectRetrievalStrategyV2, toRoutingTrace } from './routing.js';

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

    const data = await timedStep('snapshot', () => services.store.snapshot(), steps, {
      outputSize: (d) =>
        (d as Awaited<ReturnType<typeof services.store.snapshot>>).knowledgeEntries.length,
    });

    const eligibleEntries = await timedStep(
      'eligibility',
      () => Promise.resolve(filterEligibleEntries(data.knowledgeEntries, auth, parsed.filters)),
      steps,
      {
        inputSize: data.knowledgeEntries.length,
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

    const conflictHints = enrichMatchesWithConflicts(
      scoredEntries.map((e) => ({ entryId: e.entry.id })),
      data,
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
      () => Promise.resolve(parseSeedIntent(parsed.seed)),
      steps,
    );

    const routingDecision = await timedStep(
      'routing',
      () => Promise.resolve(selectRetrievalStrategyV2(parsed.seed)),
      steps,
    );

    const data = await timedStep('snapshot', () => services.store.snapshot(), steps, {
      outputSize: (d) =>
        (d as Awaited<ReturnType<typeof services.store.snapshot>>).skillArtifacts?.length ?? 0,
    });

    const governanceFilters = {
      teamId: auth.activeTeamId,
      securityLevel: auth.securityLevel,
      isSystemAdmin: auth.subjectType === 'system-admin',
    };

    const artifacts = data.skillArtifacts ?? [];

    // Phase 1: Create coordinator with heuristic channel for multi-recall seam.
    // In Phase 1, only the heuristic channel is active, preserving exact
    // backward-compatible behavior. Future phases will add more channels.
    const channelRegistry = new CapsuleChannelRegistry();
    const { capsuleHeuristicChannel } = await import('../capsules/channels/heuristic.js');
    channelRegistry.register(capsuleHeuristicChannel);
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

    routingDecision.channelsUsed = rankedCandidates.length > 0 ? ['capsule-heuristic'] : [];

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
