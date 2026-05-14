import {
  type GraphPlanFallback,
  type GraphPlanFallbackTarget,
  type GraphPlanRoutingTrace,
  type GraphPlanSearchQuery,
  type GraphPlanSearchResponse,
  type RoutingReason,
  type TrapFirstPlan,
  graphPlanSearchQuerySchema,
  graphPlanSearchResponseSchema,
} from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '../../context.js';
import { type PipelineStep, generateQueryId, logRagRetrieval } from '../../rag-log.js';
import { searchKnowledge, searchKnowledgeV2 } from '../../retrieval.js';
import { compileTrapFirstPlan } from './plan-compiler.js';

const HIGH_CONFIDENCE_THRESHOLD = 0.65;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.4;

interface GraphPlanAssessment {
  score: number;
  bucket: 'high' | 'medium' | 'low';
  reason: RoutingReason;
  fallbackTarget: GraphPlanFallbackTarget | null;
}

async function timedStep<T>(name: string, fn: () => Promise<T>, steps: PipelineStep[]): Promise<T> {
  const start = Date.now();
  const result = await fn();
  steps.push({ name, latencyMs: Date.now() - start });
  return result;
}

function toBucket(score: number): 'high' | 'medium' | 'low' {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
  return 'low';
}

export function assessGraphPlanReadiness(
  plan: GraphPlanSearchResponse['plan'],
  fallbackMode: GraphPlanSearchQuery['fallbackMode'],
): GraphPlanAssessment {
  const skillCount = plan?.recommendedSkills.length ?? 0;
  const trapCount = plan?.blockingTraps.length ?? 0;
  const hasStructure =
    plan?.edges.some((edge) => edge.type === 'mitigates' || edge.type === 'requires') ?? false;
  const hasSupportingEvidence = (plan?.citations.length ?? 0) > 0 || skillCount > 0;

  const score =
    (skillCount > 0 ? 0.4 : 0) +
    (trapCount > 0 ? 0.25 : 0) +
    (hasStructure ? 0.2 : 0) +
    (hasSupportingEvidence ? 0.15 : 0);

  const bucket = toBucket(score);

  if (bucket === 'high' && skillCount > 0) {
    return {
      score,
      bucket,
      reason: 'graph-plan-selected',
      fallbackTarget: null,
    };
  }

  const explicitTarget = fallbackMode === 'auto' ? null : fallbackMode;

  if (skillCount === 0) {
    return {
      score,
      bucket,
      reason: 'graph-plan-insufficient-skill-evidence',
      fallbackTarget: explicitTarget ?? 'v1-graph-assisted',
    };
  }

  if (trapCount === 0) {
    return {
      score,
      bucket,
      reason: 'graph-plan-insufficient-trap-evidence',
      fallbackTarget: explicitTarget ?? 'v2-capsule',
    };
  }

  return {
    score,
    bucket,
    reason: 'graph-plan-low-confidence',
    fallbackTarget: explicitTarget ?? 'v2-capsule',
  };
}

function buildRoutingTrace(
  assessment: GraphPlanAssessment,
  fallback: GraphPlanFallback | null,
): GraphPlanRoutingTrace {
  if (!fallback) {
    return {
      selectedMode: 'mix',
      routeFamily: 'graph-plan',
      routingReason: assessment.reason,
      fallbackApplied: false,
      fallbackTarget: null,
      confidenceScore: assessment.score,
      confidenceBucket: assessment.bucket,
      channelsUsed: ['plan', 'graph', 'capsule'],
    };
  }

  return {
    selectedMode: 'mix',
    routeFamily: fallback.routeFamily,
    routingReason: assessment.reason,
    fallbackApplied: true,
    fallbackTarget: assessment.fallbackTarget,
    confidenceScore: assessment.score,
    confidenceBucket: assessment.bucket,
    channelsUsed:
      fallback.routeFamily === 'capsule'
        ? ['capsule', 'profile']
        : ['semantic', 'keyword', 'graph'],
  };
}

function fallbackResultCount(fallback: GraphPlanFallback): number {
  if (fallback.routeFamily === 'capsule') {
    return fallback.response.capsules.length;
  }
  return fallback.response.globalConstraints.length + fallback.response.projectKnowledge.length;
}

export async function searchKnowledgeGraphPlan(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: GraphPlanSearchQuery,
): Promise<GraphPlanSearchResponse> {
  const startMs = Date.now();
  const queryId = generateQueryId();
  const steps: PipelineStep[] = [];

  const parsed = await timedStep(
    'parse',
    () => Promise.resolve(graphPlanSearchQuerySchema.parse(query)),
    steps,
  );

  let plan: TrapFirstPlan | null = null;
  let compileError: Error | null = null;

  try {
    plan = await timedStep(
      'compile-plan',
      () => compileTrapFirstPlan(services, auth, parsed),
      steps,
    );
  } catch (err) {
    compileError = err instanceof Error ? err : new Error(String(err));
    steps.push({ name: 'compile-plan-error', latencyMs: 0, error: compileError.message });
  }

  const assessment = plan
    ? assessGraphPlanReadiness(plan, parsed.fallbackMode)
    : {
        score: 0,
        bucket: 'low' as const,
        reason: 'graph-plan-compilation-failed' as RoutingReason,
        fallbackTarget: 'v1-graph-assisted' as const,
      };

  let fallback: GraphPlanFallback | null = null;
  if (assessment.fallbackTarget === 'v2-capsule') {
    const response = await timedStep(
      'fallback-v2',
      () =>
        searchKnowledgeV2(services, auth, {
          seed: parsed.seed,
          filters: { labels: [], scopes: [] },
          maxResults: parsed.skillBudget,
          includeSummary: false,
        }),
      steps,
    );
    fallback = {
      routeFamily: 'capsule',
      response: {
        ...response,
        activationHints: [],
      },
    };
  } else if (assessment.fallbackTarget === 'v1-graph-assisted') {
    const response = await timedStep(
      'fallback-v1',
      () =>
        searchKnowledge(services, auth, {
          seed: parsed.seed,
          filters: { labels: [], scopes: [] },
          maxResults: Math.max(parsed.skillBudget, 5),
          includeRefinement: false,
          includeSummary: false,
          mode: 'graph-assisted',
        }),
      steps,
    );
    fallback = {
      routeFamily: 'entry',
      response,
    };
  }

  const routingTrace = buildRoutingTrace(assessment, fallback);
  const response: GraphPlanSearchResponse = {
    routingTrace,
    plan: fallback ? null : plan,
    fallback,
  };

  void logRagRetrieval(services.config.ragLog, {
    timestamp: new Date(startMs).toISOString(),
    queryId,
    seed: parsed.seed,
    mode: 'v3-graph-plan',
    actorId: auth.actorId,
    teamId: auth.activeTeamId,
    pipelineSteps: steps,
    totalLatencyMs: Date.now() - startMs,
    resultCount: fallback ? fallbackResultCount(fallback) : plan!.recommendedSkills.length,
    metadata: {
      filters: { labels: [], scopes: [] },
      maxResults: parsed.skillBudget,
      includeSummary: false,
      includeRefinement: false,
      routingTrace,
    },
  });

  return graphPlanSearchResponseSchema.parse(response);
}
