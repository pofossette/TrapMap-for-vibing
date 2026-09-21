import {
  compileExecutionPlan,
  computePlanConfidence,
  type GraphPlanEdgeInput,
  type GraphPlanNodeInput,
  normalizeGraphPlanQuery,
  planNodeQueryCoverage,
  resolveGraphPlanRoutingReason,
  toGraphPlanEdgeType,
  toPlanEdgeType,
} from '@trapmap/backend-core';
import type {
  GraphPlanSearchQuery,
  GraphPlanSearchResponse,
  PlanCitation,
  RetrievalLatencyEndpoint,
  RetrievalLatencySample,
  RoutingTrace,
  TrapFirstPlan,
} from '@trapmap/contracts';
import {
  graphPlanSearchResponseSchema,
  retrievalV2ResponseWithHintsSchema,
  trapFirstPlanSchema,
} from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { generateQueryId, logRagRetrieval, type PipelineStep } from '../rag-log.js';
import { timedChannel } from '../retrieval-latency.js';
import { searchKnowledge } from '../search-knowledge.js';
import { searchV2 } from './search-v2.js';

/**
 * v3 trap-first graph-plan retrieval.
 *
 * Pipeline: query labels → graph expansion (`GraphQueryBackend`) → trap/skill
 * node extraction → Kahn topological compilation → confidence gate → either the
 * plan or a governed fallback (`v2-capsule` / `v1-graph-assisted`).
 *
 * The response is `GraphPlanSearchResponse` — the shape `trapmap load` and the
 * retrieval eval both consume. Returning the v1 bucketed shape here (the
 * pre-2026-09-19 behaviour) broke both.
 */

/** Citations carry view nodes that did not make the plan, for traceability. */
const GRAPH_PLAN_CITATION_LIMIT = 5;

/** Graph labels are normalized with hyphens (`graph-query-core.ts`), so the
 * hyphenated full seed is added to the raw tokens to match multi-word labels. */
function buildQueryLabels(seed: string): Set<string> {
  const labels = new Set(normalizeGraphPlanQuery(seed));
  const hyphenated = seed.toLowerCase().trim().replace(/\s+/g, '-');
  if (hyphenated.length > 1) labels.add(hyphenated);
  return labels;
}

function nonEmpty(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function searchV3(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: GraphPlanSearchQuery,
  endpoint: RetrievalLatencyEndpoint = 'v3-graph-plan',
): Promise<GraphPlanSearchResponse> {
  const startedAtMs = Date.now();
  const steps: PipelineStep[] = [];
  const channelSteps: RetrievalLatencySample[] = [];
  const scoped: SkillShareerServices = { ...services, latencyChannelSamples: channelSteps };
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const at = Date.now();
    const value = await run();
    steps.push({ name, latencyMs: Date.now() - at });
    return value;
  };

  const backend = services.graphQueryBackend;
  const queryLabels = buildQueryLabels(query.seed);
  const queryTokens = normalizeGraphPlanQuery(query.seed);

  let routingReason: ReturnType<typeof resolveGraphPlanRoutingReason> =
    'graph-plan-compilation-failed';
  let plan: TrapFirstPlan | null = null;
  let confidence = { score: 0, bucket: 'low' as 'high' | 'medium' | 'low' };
  let fallbackResponse: GraphPlanSearchResponse['fallback'] = null;
  let fallbackTarget: 'v2-capsule' | 'v1-graph-assisted' | null = null;
  let channelsUsed: RoutingTrace['channelsUsed'] = ['graph'];

  try {
    if (!backend) {
      throw new Error('no graph query backend wired');
    }

    const { nodeInputs, edgeInputs } = await step('snapshot', async () => {
      const sourceIds = await timedChannel(scoped, endpoint, 'graph', () =>
        backend.expandSourcesOneHop({ queryLabels }),
      );
      const seedNodeIds = new Set<string>(
        [...(await backend.getSourceNodeIds([...sourceIds])).values()].flatMap((ids) => [...ids]),
      );
      const expansion = await timedChannel(scoped, endpoint, 'graph', () =>
        backend.buildLocalExpansionView({
          seedNodeIds: [...seedNodeIds],
          maxDepth: query.maxDepth,
          auth: { teamId: auth.activeTeamId, securityLevel: auth.securityLevel },
        }),
      );

      const nodeInputs: GraphPlanNodeInput[] = [];
      for (const nodeView of expansion.nodeViewsById.values()) {
        if (nodeView.node.kind !== 'trap' && nodeView.node.kind !== 'skill') continue;
        const score = planNodeQueryCoverage(
          `${nodeView.node.label} ${nodeView.node.evidence}`,
          queryTokens,
        );
        nodeInputs.push({
          nodeId: nodeView.node.id,
          kind: nodeView.node.kind,
          label: nonEmpty(nodeView.node.label, nodeView.node.id),
          evidence: nonEmpty(nodeView.node.evidence, nodeView.node.label),
          severity: nodeView.node.severity ?? 'soft',
          sourceId: nodeView.sourceId,
          artifactId: nodeView.sourceId,
          score,
        });
      }

      const edgeInputs: GraphPlanEdgeInput[] = [];
      expansion.graph.forEachEdge((edgeId, attributes, sourceNodeId, targetNodeId) => {
        edgeInputs.push({
          edgeId,
          sourceNodeId,
          targetNodeId,
          relationType: attributes.relationType ?? '',
          strength: attributes.strength ?? 'soft',
        });
      });

      return { nodeInputs, edgeInputs };
    });

    plan = await step('recall', () =>
      Promise.resolve(
        buildTrapFirstPlan({
          nodes: nodeInputs,
          edges: edgeInputs,
          skillBudget: query.skillBudget,
        }),
      ),
    );

    // Distinct trap targets of mitigates edges — counting both endpoints would
    // credit the mitigating skill itself as evidence of mitigation.
    const mitigatedTrapCount = new Set(
      plan.edges.filter((edge) => edge.type === 'mitigates').map((edge) => edge.targetNodeId),
    ).size;
    const hardEdgeCount = plan.edges.filter((edge) => edge.strength === 'hard').length;
    confidence = computePlanConfidence({
      trapCount: plan.blockingTraps.length,
      skillCount: plan.recommendedSkills.length,
      mitigatedTrapCount,
      hardEdgeCount,
    });
    routingReason = resolveGraphPlanRoutingReason({
      trapCount: plan.blockingTraps.length,
      skillCount: plan.recommendedSkills.length,
      confidence: confidence.score,
    });
  } catch {
    routingReason = 'graph-plan-compilation-failed';
    plan = null;
  }

  const selected = routingReason === 'graph-plan-selected' && plan !== null;
  if (!selected) {
    fallbackResponse = await step('fallback', async () => {
      if (query.fallbackMode === 'v2-capsule') {
        fallbackTarget = 'v2-capsule';
        channelsUsed = ['capsule'];
        const response = retrievalV2ResponseWithHintsSchema.parse(
          await searchV2(
            services,
            auth,
            {
              seed: query.seed,
              filters: { labels: [], scopes: ['global', 'project'] },
              maxResults: 10,
              includeSummary: false,
            },
            'v2-capsule',
          ),
        );
        return { routeFamily: 'capsule' as const, response };
      }
      fallbackTarget = 'v1-graph-assisted';
      channelsUsed = ['semantic', 'keyword', 'graph'];
      const response = await searchKnowledge(services, auth, {
        seed: query.seed,
        filters: { labels: [], scopes: ['global', 'project'] },
        includeRefinement: false,
        includeSummary: false,
        mode: 'graph-assisted',
        maxResults: 10,
        latencyEndpoint: endpoint,
      });
      return { routeFamily: 'entry' as const, response };
    });
  } else {
    fallbackTarget = null;
  }

  const routingTrace: RoutingTrace = {
    selectedMode: 'hybrid',
    routeFamily: 'graph-plan',
    routingReason,
    fallbackApplied: !selected,
    channelsUsed,
    fallbackTarget,
    confidenceScore: confidence.score,
    confidenceBucket: confidence.bucket,
  };

  void logRagRetrieval(services.config.ragLog, {
    timestamp: new Date(startedAtMs).toISOString(),
    queryId: generateQueryId(),
    seed: query.seed.slice(0, 200),
    mode: 'v3-graph-plan',
    actorId: auth.actorId,
    teamId: auth.activeTeamId,
    pipelineSteps: steps,
    channelSteps,
    totalLatencyMs: Date.now() - startedAtMs,
    resultCount: selected ? (plan?.recommendedSkills.length ?? 0) : 0,
    metadata: {
      maxResults: query.skillBudget,
      includeSummary: false,
      includeRefinement: false,
      routingTrace,
      latencyEndpoint: endpoint,
    },
  });

  return graphPlanSearchResponseSchema.parse({
    routingTrace: {
      ...routingTrace,
      // The graph-plan trace sharpens the nullable base fields into concrete ones.
      fallbackTarget,
      confidenceScore: confidence.score,
      confidenceBucket: confidence.bucket,
    },
    plan: selected ? plan : null,
    fallback: fallbackResponse,
  });
}

/**
 * Assemble a `TrapFirstPlan` from expansion-view data.
 *
 * Split out from `searchV3` so the plan shape can be unit-tested without a
 * graph backend. Plan selection applies `skillBudget`; nodes outside the
 * budget surface as citations instead of disappearing.
 */
export function buildTrapFirstPlan(input: {
  nodes: GraphPlanNodeInput[];
  edges: GraphPlanEdgeInput[];
  skillBudget: number;
}): TrapFirstPlan {
  const traps = input.nodes
    .filter((node) => node.kind === 'trap')
    .sort((left, right) => right.score - left.score);
  const allSkills = input.nodes
    .filter((node) => node.kind === 'skill')
    .sort((left, right) => right.score - left.score);
  const skills = allSkills.slice(0, input.skillBudget);

  const selectedIds = new Set([...traps, ...skills].map((node) => node.nodeId));

  const planEdges = [];
  const graphEdges = [];
  for (const edge of input.edges) {
    if (!selectedIds.has(edge.sourceNodeId) || !selectedIds.has(edge.targetNodeId)) continue;
    const planType = toPlanEdgeType(edge.relationType);
    if (planType) {
      planEdges.push({
        id: edge.edgeId,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        type: planType,
        strength: edge.strength,
      });
    }
    const graphType = toGraphPlanEdgeType(edge.relationType);
    if (graphType) {
      graphEdges.push({
        id: edge.edgeId,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        type: graphType,
        strength: edge.strength,
      });
    }
  }

  const blockingTraps = traps.map((node) => ({
    nodeId: node.nodeId,
    sourceId: node.sourceId,
    label: node.label,
    severity: node.severity,
    scope: 'global' as const,
    requiredLevel: 0,
    evidence: node.evidence,
    score: node.score,
  }));
  const recommendedSkills = skills.map((node) => ({
    nodeId: node.nodeId,
    artifactId: node.artifactId,
    label: node.label,
    // Graph skill nodes carry label + evidence only; the capsule fields the
    // plan contract requires are filled from that evidence rather than invented.
    situation: node.label,
    problem: node.evidence,
    goal: node.evidence,
    scope: 'global' as const,
    requiredLevel: 0,
    score: node.score,
  }));

  const citations: PlanCitation[] = allSkills
    .slice(input.skillBudget)
    .slice(0, GRAPH_PLAN_CITATION_LIMIT)
    .map((node) => ({
      sourceId: node.sourceId,
      sourceKind: 'skill' as const,
      label: node.label,
      scope: 'global' as const,
      score: node.score,
    }));

  const executionPlan = compileExecutionPlan(
    [...traps, ...skills].map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      label: node.label,
    })),
    planEdges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      relationType: edge.type,
      strength: edge.strength,
      edgeId: edge.id,
    })),
  );

  return trapFirstPlanSchema.parse({
    blockingTraps,
    recommendedSkills,
    edges: planEdges,
    citations,
    executionPlan,
    graph: {
      nodes: [
        ...blockingTraps.map((node) => ({ ...node, kind: 'trap' as const })),
        ...recommendedSkills.map((node) => ({ ...node, kind: 'skill' as const })),
      ],
      edges: graphEdges,
      citations: [],
      focus: {
        blockingTrapNodeIds: blockingTraps.map((node) => node.nodeId),
        recommendedSkillNodeIds: recommendedSkills.map((node) => node.nodeId),
      },
    },
  });
}
