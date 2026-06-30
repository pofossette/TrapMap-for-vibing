import {
  type RetrievalQuery,
  type RetrievalResponse,
  retrievalQuerySchema,
} from '@trapmap/contracts';

import { enrichMatchesWithConflicts } from '@trapmap/server/lib/conflict/enrich.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { generateEmbedding, hashEmbeddingText } from '@trapmap/server/lib/embeddings.js';
import type { PipelineStep } from '@trapmap/server/lib/rag-log.js';
import { generateQueryId, logRagRetrieval } from '@trapmap/server/lib/rag-log.js';
import { buildRetrievalReadModel } from '@trapmap/server/lib/retrieval/read-model.js';
import {
  buildEmptyResponse,
  buildRetrievalResponse,
  assembleResponseBuckets,
} from '@trapmap/server/lib/retrieval/response/assembly.js';
import { buildCitations } from '@trapmap/server/lib/retrieval/response/citations.js';
import { generateRefinement } from '@trapmap/server/lib/retrieval/response/refinement.js';
import { buildSummary } from '@trapmap/server/lib/retrieval/response/summary.js';
import type { StoreData } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import {
  filterByBoundaryContext,
  filterEligibleEntries,
} from '@trapmap/server/lib/retrieval/orchestration/filters.js';
import {
  selectRetrievalStrategy,
  toRoutingTrace,
} from '@trapmap/server/lib/retrieval/orchestration/routing.js';

import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { buildEmbeddingText } from './retrieval-semantic.js';
import type { ScoredEntry } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';
import { dispatchByMode, inferChannelsFromMerged } from './retrieval-recall-coordinator.js';

function buildRoutingTrace(
  routingDecision: ReturnType<typeof selectRetrievalStrategy>,
  recallTrace?: { graph?: unknown },
) {
  return {
    ...toRoutingTrace(routingDecision),
    ...(recallTrace?.graph ? { graphRetrieval: recallTrace.graph } : {}),
  };
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
        Promise.resolve(filterEligibleEntries(readModel.knowledgeEntries, auth, parsed.filters)),
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
      const routingTrace = buildRoutingTrace(emptyRouting);
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
      () => Promise.resolve(selectRetrievalStrategy(parsed.mode, parsed.seed)),
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
        routingTrace: buildRoutingTrace(routingDecision, trace),
      },
    });

    return {
      ...result,
      routingTrace: buildRoutingTrace(routingDecision, trace),
    };
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
        routingTrace: buildRoutingTrace(failRouting),
      },
    });
    throw error;
  }
}

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
