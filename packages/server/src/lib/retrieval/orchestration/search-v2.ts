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

import {
  type CapsuleMatch,
  type ProfileHint,
  type RetrievalV2Query,
  type RetrievalV2Response,
  retrievalV2QuerySchema,
} from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import type { PipelineStep, RagLogEntry } from '@trapmap/server/lib/rag-log.js';
import { generateQueryId, logRagRetrieval } from '@trapmap/server/lib/rag-log.js';
import {
  CapsuleRecallCoordinator,
  buildProfileShortlist,
  createFullCapsuleChannelRegistry,
  getCapsuleRecords,
  InMemoryIntentCache,
  parseSeedIntentWithLLM,
} from '@trapmap/server/lib/retrieval/capsules/index.js';
import { buildRetrievalReadModel } from '@trapmap/server/lib/retrieval/read-model.js';
import {
  buildAllActivationHints,
  buildCapsuleMatch,
  buildEmptyV2Response,
  buildProfileHint,
  buildV2RetrievalResponse,
  buildCapsuleCitations,
  buildCapsuleSummary,
} from '@trapmap/server/lib/retrieval/response/index.js';
import { buildRoutingTrace } from './routing-trace.js';
import { selectRetrievalStrategyV2 } from './routing.js';
import { timedStep } from './pipeline-timing.js';

const intentCache = new InMemoryIntentCache();

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

    const readModel = await timedStep(
      'snapshot',
      () => buildRetrievalReadModel(services.repos),
      steps,
      {
        outputSize: (d) =>
          (d as Awaited<ReturnType<typeof buildRetrievalReadModel>>).skillArtifacts.length ?? 0,
      },
    );

    const governanceFilters = {
      teamId: auth.activeTeamId,
      securityLevel: auth.securityLevel,
      isSystemAdmin: auth.subjectType === 'system-admin',
      scopes: (parsed.filters?.scopes ?? []) as Array<'global' | 'project'>,
      labels: parsed.filters?.labels ?? [],
    };

    const artifacts = readModel.skillArtifacts;

    // Phase 5: Create coordinator with heuristic + keyword + semantic + graph channels.
    // Uses shared factory to register all channels with PG feature flags.
    const pgPool = services.store instanceof PostgresStore ? services.store.getPool() : null;

    const channelRegistry = await createFullCapsuleChannelRegistry({
      pgPool,
      pgKeywordFlag: () => process.env.RETRIEVAL_CAPSULE_PG_KEYWORD === 'true',
      pgSemanticFlag: () => process.env.RETRIEVAL_CAPSULE_PG_SEMANTIC === 'true',
      graphQueryBackend: services.graphQueryBackend,
    });
    const coordinator = new CapsuleRecallCoordinator(channelRegistry);

    const recallResult = await timedStep(
      'recall',
      () =>
        coordinator.execute({
          artifacts,
          intent,
          governanceFilters,
          maxResults: parsed.maxResults,
          allowWeakBackfill:
            parsed.includeSummary === true || /how to|why .* broken|production/i.test(parsed.seed),
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

    steps.push({
      name: 'threshold-gate',
      latencyMs: 0,
      inputSize: recallResult.mergeStats.totalChannelCandidates,
      outputSize: rankedCandidates.length,
    });

    if (rankedCandidates.length === 0) {
      const routingTrace = buildRoutingTrace(routingDecision);
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
          routingTrace,
        },
      });
      return {
        ...buildEmptyV2Response(),
        routingTrace,
      };
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
    const routingTrace = buildRoutingTrace(routingDecision);

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
        routingTrace,
        mergeStats: recallResult.mergeStats,
        channelsFailed: recallResult.channelsFailed,
        parseMethod: intent.parseMethod,
        intentCategory: intent.category,
      },
    } as RagLogEntry);

    return {
      ...result,
      routingTrace,
    };
  } catch (error) {
    const failRouting = selectRetrievalStrategyV2(query.seed ?? '');
    const routingTrace = buildRoutingTrace(failRouting);
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
        routingTrace,
      },
    });
    throw error;
  }
}
