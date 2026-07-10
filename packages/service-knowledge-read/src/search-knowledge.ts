import { InvocationError } from '@trapmap/backend-core';
import {
  type RetrievalQuery,
  type RetrievalResponse,
  type RoutingTrace,
  retrievalQuerySchema,
} from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { filterByBoundaryContext, filterEligibleEntries } from './filters.js';
import { type PipelineStep, generateQueryId, logRagRetrieval } from './rag-log.js';
import { buildRetrievalReadModel } from './read-model.js';
import {
  assembleResponseBuckets,
  buildEmptyResponse,
  buildRetrievalResponse,
} from './response-assembly.js';
import { buildCitations } from './response-citations.js';
import { generateRefinement } from './response-refinement.js';
import { buildSummary } from './response-summary.js';
import { getRetrievalInfra } from './retrieval-infra.js';
import { dispatchByMode, inferChannelsFromMerged } from './retrieval-recall-coordinator.js';
import { buildEmbeddingText } from './retrieval-semantic.js';
import type { ScoredEntry } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

function nowIso(): string {
  return new Date().toISOString();
}

function buildRoutingTrace(
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

interface TimedStepOptions {
  inputSize?: number;
  outputSize?: number | ((result: unknown) => number);
}

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

export async function searchKnowledge(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: RetrievalQuery,
): Promise<RetrievalResponse> {
  const startMs = Date.now();
  const queryId = generateQueryId();
  const steps: PipelineStep[] = [];
  const infra = getRetrievalInfra(services);

  try {
    const parsed = await timedStep(
      'parse',
      () => Promise.resolve(retrievalQuerySchema.parse(query)),
      steps,
    );

    const readModel = await timedStep(
      'snapshot',
      () => buildRetrievalReadModel(services.repos),
      steps,
      {
        outputSize: (d) =>
          (d as Awaited<ReturnType<typeof buildRetrievalReadModel>>).knowledgeEntries.length,
      },
    );

    const eligibleEntries = await timedStep(
      'eligibility',
      () =>
        Promise.resolve(
          filterEligibleEntries(readModel.knowledgeEntries, auth, parsed.filters, services),
        ),
      steps,
      {
        inputSize: readModel.knowledgeEntries.length,
        outputSize: (r) => (r as KnowledgeRecord[]).length,
      },
    );

    const boundaryFiltered = await timedStep(
      'boundary-filter',
      () =>
        Promise.resolve(filterByBoundaryContext(eligibleEntries, parsed.boundaryContext, services)),
      steps,
      { inputSize: eligibleEntries.length, outputSize: (r) => (r as KnowledgeRecord[]).length },
    );

    if (boundaryFiltered.length === 0) {
      const emptyRouting = infra.routing.selectStrategy(parsed.mode, parsed.seed);
      const routingTrace = buildRoutingTrace(services, emptyRouting);
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
          routingTrace,
        },
      });
      return {
        ...buildEmptyResponse(),
        routingTrace,
      };
    }

    const routingDecision = await timedStep(
      'routing',
      () => Promise.resolve(infra.routing.selectStrategy(parsed.mode, parsed.seed)),
      steps,
    );

    const { scoredEntries, mergedCandidates, trace } = await timedStep(
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
    };
    const conflictHints = infra.conflicts.enrichMatches(
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
        routingTrace: buildRoutingTrace(services, routingDecision, trace),
      },
    });

    return {
      ...result,
      routingTrace: buildRoutingTrace(services, routingDecision, trace),
    };
  } catch (error) {
    const failRouting = infra.routing.selectStrategy(query.mode ?? 'semantic', query.seed ?? '');
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
        routingTrace: buildRoutingTrace(services, failRouting),
      },
    });
    throw error;
  }
}

export async function updateEntryEmbeddingCache(
  services: SkillShareerServices,
  entryId: string,
): Promise<void> {
  const infra = getRetrievalInfra(services);
  const entry = await services.repos.knowledge.getById(entryId);
  if (!entry) {
    throw InvocationError.notFound('Knowledge entry not found');
  }

  const text = buildEmbeddingText(entry);
  const textHash = infra.embeddings.hashText(text);
  const vector = await infra.embeddings.generate(text);

  await services.repos.knowledge.updateEmbeddingCache(entryId, {
    textHash,
    vector,
    createdAt: nowIso(),
    revision: entry.history.length,
  });
}
