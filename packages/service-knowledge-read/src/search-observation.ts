/**
 * Observability payload builders for `searchKnowledge`.
 *
 * Split out of `search-knowledge.ts` to keep that file inside its line budget:
 * both functions only reshape data that already exists — the routing trace
 * returned to the caller, and the `RagLogEntry` written to the JSONL sample —
 * so they hold no pipeline behaviour of their own.
 */

import type {
  RetrievalLatencyEndpoint,
  RetrievalLatencySample,
  RetrievalQuery,
  RoutingTrace,
} from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import type { PipelineStep, RagLogEntry } from './rag-log.js';
import { getRetrievalInfra } from './retrieval-infra.js';

export function buildRoutingTrace(
  services: SkillShareerServices,
  routingDecision: ReturnType<ReturnType<typeof getRetrievalInfra>['routing']['selectStrategy']>,
  recallTrace?: { graph?: unknown },
): RoutingTrace {
  const infra = getRetrievalInfra(services);
  return {
    ...infra.routing.toRoutingTrace(routingDecision),
    ...(recallTrace?.graph ? { graphRetrieval: recallTrace.graph } : {}),
  } as RoutingTrace;
}

export function buildRagLogEntry(options: {
  auth: ResolvedAuthContext;
  endpoint: RetrievalLatencyEndpoint;
  includeRefinement: boolean;
  includeSummary: boolean;
  maxResults: number;
  mode: string;
  queryId: string;
  resultCount: number;
  routingTrace: RoutingTrace;
  seed: string;
  startedAtMs: number;
  steps: PipelineStep[];
  channelSteps?: RetrievalLatencySample[];
  filters?: RetrievalQuery['filters'];
}): RagLogEntry {
  const metadata: RagLogEntry['metadata'] = {
    maxResults: options.maxResults,
    includeSummary: options.includeSummary,
    includeRefinement: options.includeRefinement,
    routingTrace: options.routingTrace,
    latencyEndpoint: options.endpoint,
  };
  if (options.filters) {
    metadata.filters = {
      labels: options.filters.labels,
      scopes: options.filters.scopes,
    };
  }
  return {
    timestamp: new Date(options.startedAtMs).toISOString(),
    queryId: options.queryId,
    seed: options.seed,
    mode: options.mode as RagLogEntry['mode'],
    actorId: options.auth.actorId,
    teamId: options.auth.activeTeamId,
    pipelineSteps: options.steps,
    ...(options.channelSteps && options.channelSteps.length > 0
      ? { channelSteps: options.channelSteps }
      : {}),
    totalLatencyMs: Date.now() - options.startedAtMs,
    resultCount: options.resultCount,
    metadata,
  };
}
