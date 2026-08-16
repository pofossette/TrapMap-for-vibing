import { InvocationError } from '@trapmap/backend-core';
import type { IntentRecognitionPort } from '@trapmap/backend-core';
import {
  type RetrievalQuery,
  type RetrievalResponse,
  type RoutingTrace,
  retrievalQuerySchema,
} from '@trapmap/contracts';
import { nowIso } from '@trapmap/lib';

import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { filterByBoundaryContext, filterEligibleEntries } from './filters.js';
import {
  type PipelineStep,
  type RagLogEntry,
  generateQueryId,
  logRagRetrieval,
} from './rag-log.js';
import { buildRetrievalReadModel } from './read-model.js';
import {
  assembleResponseBuckets,
  buildEmptyResponse,
  buildRetrievalResponse,
} from './response-assembly.js';
import { buildCitations } from './response-citations.js';
import { generateRefinement } from './response-refinement.js';
import { buildSummary } from './response-summary.js';
import { mergeArtifactsIntoRetrievalPool } from './artifact-entry-merge.js';
import { createRuleIntentRecognition } from './intent-recognition/rule-intent-recognition.js';
import { getRetrievalInfra } from './retrieval-infra.js';
import { dispatchByMode, inferChannelsFromMerged } from './retrieval-recall-coordinator.js';
import { buildEmbeddingText } from './retrieval-semantic.js';
import type { ScoredEntry } from './retrieval-types.js';
import type { KnowledgeRecord } from './store.js';

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

/**
 * Resolve the D8 intent-recognition judgment port (design D8 call-site
 * migration): the assembly/host-provided port when wired, else the rule
 * implementation (pre-contract routing semantics, behavior-preserving).
 */
function getIntentRecognition(services: SkillShareerServices): IntentRecognitionPort {
  return services.intentRecognition ?? createRuleIntentRecognition();
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

function buildRagLogEntry(options: {
  auth: ResolvedAuthContext;
  includeRefinement: boolean;
  includeSummary: boolean;
  maxResults: number;
  mode: string;
  queryId: string;
  resultCount: number;
  routingTrace: RoutingTrace;
  seed: string;
  services: SkillShareerServices;
  startedAtMs: number;
  steps: PipelineStep[];
  filters?: RetrievalQuery['filters'];
}): RagLogEntry {
  const metadata: RagLogEntry['metadata'] = {
    maxResults: options.maxResults,
    includeSummary: options.includeSummary,
    includeRefinement: options.includeRefinement,
    routingTrace: options.routingTrace,
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
    totalLatencyMs: Date.now() - options.startedAtMs,
    resultCount: options.resultCount,
    metadata,
  };
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
  const intentRecognition = getIntentRecognition(services);

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
          // cron retrieval-version linkage (2026-08-16): skill artifacts join
          // the recall pool as entry views (latestRevision.version preserved,
          // versioned decay meta synthesized) and are eligibility-filtered
          // together with knowledge entries.
          filterEligibleEntries(
            mergeArtifactsIntoRetrievalPool(readModel.knowledgeEntries, readModel.skillArtifacts),
            auth,
            parsed.filters,
            services,
          ),
        ),
      steps,
      {
        inputSize: readModel.knowledgeEntries.length + readModel.skillArtifacts.length,
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
      const emptyDecision = await intentRecognition.recognize({
        query: parsed.seed,
        requestedMode: parsed.mode,
        knownModes: services.strategyRegistry.all().map((strategy) => strategy.version),
        seed: parsed.seed,
      });
      const emptyRouting = infra.routing.selectStrategy(emptyDecision.mode, parsed.seed);
      const routingTrace = buildRoutingTrace(services, emptyRouting);
      void logRagRetrieval(
        services.config.ragLog,
        buildRagLogEntry({
          auth,
          services,
          startedAtMs: startMs,
          steps,
          resultCount: 0,
          queryId,
          seed: parsed.seed,
          mode: parsed.mode,
          includeSummary: parsed.includeSummary ?? false,
          includeRefinement: parsed.includeRefinement ?? false,
          maxResults: parsed.maxResults,
          filters: parsed.filters,
          routingTrace,
        }),
      );
      return {
        ...buildEmptyResponse(),
        routingTrace,
      };
    }

    let recognizedMode: string | undefined;
    const routingDecision = await timedStep(
      'routing',
      async () => {
        const recognized = await intentRecognition.recognize({
          query: parsed.seed,
          requestedMode: parsed.mode,
          knownModes: services.strategyRegistry.all().map((strategy) => strategy.version),
          seed: parsed.seed,
        });
        recognizedMode = recognized.mode;
        return infra.routing.selectStrategy(recognized.mode, parsed.seed);
      },
      steps,
    );

    const { scoredEntries, mergedCandidates, trace } = await timedStep(
      'recall',
      () =>
        dispatchByMode(
          recognizedMode ?? parsed.mode,
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

    void logRagRetrieval(
      services.config.ragLog,
      buildRagLogEntry({
        auth,
        services,
        startedAtMs: startMs,
        steps,
        resultCount: globalConstraints.length + projectKnowledge.length,
        queryId,
        seed: parsed.seed,
        mode: parsed.mode,
        includeSummary: parsed.includeSummary ?? false,
        includeRefinement: parsed.includeRefinement ?? false,
        maxResults: parsed.maxResults,
        filters: parsed.filters,
        routingTrace: buildRoutingTrace(services, routingDecision, trace),
      }),
    );

    return {
      ...result,
      routingTrace: buildRoutingTrace(services, routingDecision, trace),
    };
  } catch (error) {
    // Failure-trace path: render the routing trace for the RAG log without
    // invoking the intent port — the raw mode may be schema-invalid and the
    // failure logging must not depend on judgment.
    const failRouting = infra.routing.selectStrategy(query.mode ?? 'semantic', query.seed ?? '');
    void logRagRetrieval(
      services.config.ragLog,
      buildRagLogEntry({
        auth,
        services,
        startedAtMs: startMs,
        steps,
        resultCount: 0,
        queryId,
        seed: query.seed ?? '',
        mode: query.mode ?? 'semantic',
        includeSummary: query.includeSummary ?? false,
        includeRefinement: query.includeRefinement ?? false,
        maxResults: query.maxResults ?? 10,
        filters: query.filters,
        routingTrace: buildRoutingTrace(services, failRouting),
      }),
    );
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

  const text = buildEmbeddingText(entry as KnowledgeRecord);
  const textHash = infra.embeddings.hashText(text);
  const vector = await infra.embeddings.generate(text);

  await services.repos.knowledge.updateEmbeddingCache(entryId, {
    textHash,
    vector,
    createdAt: nowIso(),
    revision: (entry as KnowledgeRecord).history.length,
  });
}
