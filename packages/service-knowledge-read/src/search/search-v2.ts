import type {
  RetrievalLatencyEndpoint,
  RetrievalLatencySample,
  RetrievalV2Query,
  RetrievalV2Response,
  RoutingTrace,
} from '@trapmap/contracts';
import { retrievalV2ResponseSchema } from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { generateQueryId, logRagRetrieval, type PipelineStep } from '../rag-log.js';
import { getRetrievalInfra } from '../retrieval-infra.js';
import { timedChannel } from '../retrieval-latency.js';
import {
  assembleCapsuleResults,
  type CapsuleRecallContext,
  heuristicCapsuleChannel,
  keywordCapsuleChannel,
  loadCapsulePool,
  semanticCapsuleChannel,
} from './capsule-recall.js';
import { tokenizeForScoring } from './capsule-scoring.js';

/**
 * v2 capsule-native search.
 *
 * Runs the three capsule channels over the persisted capsule projections and
 * returns capsule-first results with artifact profile hints. Distinct from the
 * v1 knowledge-entry pipeline: different pool, different channels, different
 * response shape.
 *
 * Channel timings are emitted through the same `timedChannel` sink as v1, so
 * `trapmap_retrieval_channel_duration_ms{endpoint="v2-capsule"}` is comparable
 * with the other surfaces.
 */
export async function searchV2(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: RetrievalV2Query,
  endpoint: RetrievalLatencyEndpoint = 'v2-capsule',
): Promise<RetrievalV2Response> {
  const pool = services.store.getPool?.() ?? null;
  if (!pool) {
    return retrievalV2ResponseSchema.parse({ capsules: [], profileHints: [] });
  }

  const startedAtMs = Date.now();
  const steps: PipelineStep[] = [];
  const channelSteps: RetrievalLatencySample[] = [];
  // Per-request clone: channel samples land on this object, never on the
  // shared host-level services bundle.
  const scoped: SkillShareerServices = { ...services, latencyChannelSamples: channelSteps };
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const at = Date.now();
    const value = await run();
    steps.push({ name, latencyMs: Date.now() - at });
    return value;
  };

  const context: CapsuleRecallContext = {
    teamId: auth.activeTeamId,
    maxRequiredLevel: auth.securityLevel,
    scopes: ['global', 'project'],
    labels: query.filters?.labels ?? [],
  };
  const maxResults = query.maxResults;
  // Over-fetch each channel so the RRF fusion has enough signal before the gate.
  const channelLimit = Math.max(maxResults * 2, 20);
  const queryTokens = tokenizeForScoring(query.seed);

  // Pool loading is a pipeline stage, not a recall channel — tagging it as
  // `heuristic` would double-count that channel and inflate its latency.
  const candidates = await step('snapshot', () => loadCapsulePool(pool, context));

  const { keywordIds, semanticIds, heuristicIds } = await step('recall', async () => {
    const [keyword, semantic, heuristic] = await Promise.all([
      timedChannel(scoped, endpoint, 'keyword', () =>
        keywordCapsuleChannel(pool, query.seed, context, channelLimit),
      ),
      timedChannel(scoped, endpoint, 'semantic', async () => {
        const queryVector = await getRetrievalInfra(services).embeddings.generate(query.seed);
        return semanticCapsuleChannel(pool, queryVector, context, channelLimit);
      }),
      timedChannel(scoped, endpoint, 'heuristic', () =>
        Promise.resolve(heuristicCapsuleChannel(queryTokens, candidates, channelLimit)),
      ),
    ]);
    return { keywordIds: keyword, semanticIds: semantic, heuristicIds: heuristic };
  });

  const assembled = await step('assembly', () =>
    Promise.resolve(
      assembleCapsuleResults({
        pool: candidates,
        channelIds: { keyword: keywordIds, semantic: semanticIds, heuristic: heuristicIds },
        queryTokens,
        maxResults,
      }),
    ),
  );

  // `routingTrace.channelsUsed` has a fixed vocabulary that predates this
  // pipeline: the in-process rule channel is reported as `capsule`, which is
  // what it ranks.
  const channelsUsed: RoutingTrace['channelsUsed'] = assembled.channelsUsed
    .map((channel) => (channel === 'heuristic' ? 'capsule' : channel))
    .filter((channel): channel is RoutingTrace['channelsUsed'][number] =>
      ['semantic', 'keyword', 'graph', 'capsule', 'profile', 'plan'].includes(channel),
    );
  const topScore = assembled.capsules[0]?.score ?? 0;

  const routingTrace: RoutingTrace = {
    selectedMode: 'hybrid',
    routeFamily: 'capsule',
    routingReason: 'v2-default-capsule',
    fallbackApplied: false,
    channelsUsed,
    fallbackTarget: null,
    confidenceScore: topScore,
    confidenceBucket: topScore >= 0.7 ? 'high' : topScore >= 0.4 ? 'medium' : 'low',
  };

  // Same RAG-log sink as v1/v3 so `retrieval-latency-report` covers all four
  // surfaces from one source.
  void logRagRetrieval(services.config.ragLog, {
    timestamp: new Date(startedAtMs).toISOString(),
    queryId: generateQueryId(),
    // `seed` is truncated to what the v1 pipeline already logs; the full seed
    // never reaches a log line.
    seed: query.seed.slice(0, 200),
    mode: 'v2-capsule',
    actorId: auth.actorId,
    teamId: auth.activeTeamId,
    pipelineSteps: steps,
    channelSteps,
    totalLatencyMs: Date.now() - startedAtMs,
    resultCount: assembled.capsules.length,
    metadata: {
      maxResults,
      includeSummary: false,
      includeRefinement: false,
      routingTrace,
      latencyEndpoint: endpoint,
    },
  });

  return retrievalV2ResponseSchema.parse({
    capsules: assembled.capsules,
    profileHints: assembled.profileHints,
    routingTrace,
  });
}

export const searchV2Channel = 'v2-capsule';
