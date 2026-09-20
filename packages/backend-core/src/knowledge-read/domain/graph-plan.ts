/**
 * Trap-first graph-plan compilation (v3 retrieval surface).
 *
 * Pure domain functions: no framework, no DB, no graphology. The service layer
 * extracts plain node/edge data from the `GraphQueryBackend` expansion view and
 * hands it here; everything below operates on that plain data.
 *
 * **Provenance (2026-09-19)**: `docs/architecture/components/RETRIEVAL.md`
 * documents this compiler (`mitigates / requires / order → Kahn → ExecutionStep[]`)
 * but no implementation survived the `packages/server` retirement. This module
 * implements the documented shape; the parts the documentation does not pin
 * down (edge direction conventions, confidence formula, selection gate) are
 * stated inline as decisions rather than facts.
 */

import type { ExecutionStep, GraphPlanEdgeType, PlanEdgeType } from '@trapmap/contracts';

import { normalizeQuery } from './tokenization.js';

// ---------------------------------------------------------------------------
// Inputs — plain data extracted from a GraphQueryExpansionView
// ---------------------------------------------------------------------------

export interface GraphPlanNodeInput {
  nodeId: string;
  /** `'trap'` nodes become blocker steps; `'skill'` nodes become actions. */
  kind: 'trap' | 'skill';
  label: string;
  evidence: string;
  severity: 'hard' | 'soft';
  sourceId: string;
  artifactId: string;
  capsuleId?: string;
  /** Token coverage against the query, in [0, 1]. */
  score: number;
}

export interface GraphPlanEdgeInput {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Graph relation vocabulary (9 values, superset of the plan edge set). */
  relationType: string;
  strength: 'hard' | 'soft';
}

// ---------------------------------------------------------------------------
// Edge direction conventions
// ---------------------------------------------------------------------------

/**
 * Ordering constraints extracted from graph edges.
 *
 * Direction conventions (decisions, not documented facts):
 * - `mitigates` — graph data stores `source = skill, target = trap` (see
 *   `graph-query-core.ts` `mitigatingSkillNodeIdsByTrapNodeId`). The trap
 *   mitigation step precedes the skill that benefits from it.
 * - `risk-blocks` — the blocking risk precedes the blocked node.
 * - `requires` — "A requires B": B precedes A.
 * - `order` — "A before B": A precedes B.
 * - `co-occurs-with` and unknown relation types impose no ordering.
 */
export function planPredecessorsOf(
  edge: Pick<GraphPlanEdgeInput, 'sourceNodeId' | 'targetNodeId' | 'relationType'>,
): { predecessor: string; dependent: string } | null {
  switch (edge.relationType) {
    case 'mitigates':
      // skill → trap: the trap must be addressed first.
      return { predecessor: edge.targetNodeId, dependent: edge.sourceNodeId };
    case 'risk-blocks':
      // blocker → blocked node.
      return { predecessor: edge.sourceNodeId, dependent: edge.targetNodeId };
    case 'requires':
      // A requires B → B first.
      return { predecessor: edge.targetNodeId, dependent: edge.sourceNodeId };
    case 'order':
      // A before B.
      return { predecessor: edge.sourceNodeId, dependent: edge.targetNodeId };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Kahn topological sort
// ---------------------------------------------------------------------------

/**
 * Topologically sort plan nodes into `ExecutionStep[]`.
 *
 * - Trap steps are roots: they always start at rank 0 (blockers first).
 * - Rank = topological level; `blockedBy` lists direct predecessors only.
 * - Cycles cannot be rejected (the graph is user/LLM-derived), so leftovers
 *   are appended after the acyclic core with their `blockedBy` preserved —
 *   a documented degradation, not a silent drop.
 */
export function compileExecutionPlan(
  nodes: Array<Pick<GraphPlanNodeInput, 'nodeId' | 'kind' | 'label'>>,
  edges: GraphPlanEdgeInput[],
): ExecutionStep[] {
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const blockedBy = new Map<string, Set<string>>();
  for (const node of nodes) blockedBy.set(node.nodeId, new Set());

  for (const edge of edges) {
    const ordered = planPredecessorsOf(edge);
    if (!ordered) continue;
    if (!nodeById.has(ordered.predecessor) || !nodeById.has(ordered.dependent)) continue;
    if (ordered.predecessor === ordered.dependent) continue;
    blockedBy.get(ordered.dependent)?.add(ordered.predecessor);
  }

  const remaining = new Set(nodeById.keys());
  const done = new Set<string>();
  const steps: ExecutionStep[] = [];
  let rank = 0;

  while (remaining.size > 0) {
    // All nodes whose predecessors are already emitted form this level.
    const level = [...remaining].filter((nodeId) =>
      [...(blockedBy.get(nodeId) ?? [])].every((predecessor) => done.has(predecessor)),
    );
    if (level.length === 0) {
      // Cycle: emit the rest with their blockedBy intact so callers can see
      // the unresolved dependency instead of losing it.
      for (const nodeId of remaining) {
        const node = nodeById.get(nodeId);
        if (!node) continue;
        steps.push({
          rank,
          nodeId: node.nodeId,
          label: node.label,
          kind: node.kind === 'trap' ? 'trap-mitigation' : 'skill',
          blockedBy: [...(blockedBy.get(nodeId) ?? [])].filter((p) => !done.has(p)),
        });
      }
      break;
    }
    for (const nodeId of level) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      steps.push({
        rank,
        nodeId: node.nodeId,
        label: node.label,
        kind: node.kind === 'trap' ? 'trap-mitigation' : 'skill',
        blockedBy: [...(blockedBy.get(nodeId) ?? [])].filter((predecessor) =>
          done.has(predecessor),
        ),
      });
      remaining.delete(nodeId);
      done.add(nodeId);
    }
    rank += 1;
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Token coverage of `text` against the query tokens, in [0, 1]. */
export function planNodeQueryCoverage(text: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const field = new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  );
  let hits = 0;
  for (const token of queryTokens) {
    if (field.has(token)) hits += 1;
  }
  return hits / queryTokens.length;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export interface GraphPlanConfidenceInput {
  trapCount: number;
  skillCount: number;
  /** Distinct trap node ids that at least one skill mitigates. */
  mitigatedTrapCount: number;
  hardEdgeCount: number;
}

export interface GraphPlanConfidence {
  score: number;
  bucket: 'high' | 'medium' | 'low';
}

/** Evidence richness per dimension; 3+ items of a kind saturate its term. */
const GRAPH_PLAN_SATURATION = 3;

/**
 * Confidence = 0.4 × trap evidence + 0.3 × skill evidence + 0.3 × linkage.
 *
 * The 0.4/0.3/0.3 split and the saturation point (3) are decisions: the
 * documentation only requires a "readiness score" with high/medium/low buckets.
 */
export function computePlanConfidence(input: GraphPlanConfidenceInput): GraphPlanConfidence {
  const trapTerm = Math.min(1, input.trapCount / GRAPH_PLAN_SATURATION);
  const skillTerm = Math.min(1, input.skillCount / GRAPH_PLAN_SATURATION);
  const mitigatedTerm =
    input.mitigatedTrapCount > 0
      ? Math.min(1, input.mitigatedTrapCount / GRAPH_PLAN_SATURATION)
      : input.hardEdgeCount > 0
        ? 0.5
        : 0;
  const score = 0.4 * trapTerm + 0.3 * skillTerm + 0.3 * mitigatedTerm;
  const bucket = score >= 0.6 ? 'high' : score >= 0.3 ? 'medium' : 'low';
  return { score: Math.round(score * 100) / 100, bucket };
}

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

export type GraphPlanRoutingReason =
  | 'graph-plan-selected'
  | 'graph-plan-low-confidence'
  | 'graph-plan-insufficient-trap-evidence'
  | 'graph-plan-insufficient-skill-evidence'
  | 'graph-plan-compilation-failed';

/**
 * Selection gate.
 *
 * A plan is returned directly only when it has both blockers and actions and
 * the confidence reaches the medium/high boundary (0.5). Anything else falls
 * back to a legacy surface with the reason code carried in `routingTrace`.
 */
export const GRAPH_PLAN_MIN_CONFIDENCE = 0.5;

export function resolveGraphPlanRoutingReason(input: {
  trapCount: number;
  skillCount: number;
  confidence: number;
}): GraphPlanRoutingReason {
  if (input.trapCount === 0) return 'graph-plan-insufficient-trap-evidence';
  if (input.skillCount === 0) return 'graph-plan-insufficient-skill-evidence';
  if (input.confidence < GRAPH_PLAN_MIN_CONFIDENCE) return 'graph-plan-low-confidence';
  return 'graph-plan-selected';
}

// ---------------------------------------------------------------------------
// Edge vocabulary mapping
// ---------------------------------------------------------------------------

const PLAN_EDGE_TYPES: ReadonlySet<string> = new Set<PlanEdgeType>([
  'risk-blocks',
  'mitigates',
  'requires',
  'order',
]);

const GRAPH_EDGE_TYPES: ReadonlySet<string> = new Set<GraphPlanEdgeType>([
  'risk-blocks',
  'mitigates',
  'requires',
  'order',
  'co-occurs-with',
]);

/**
 * Map the 9-value graph relation vocabulary onto the plan edge vocabulary.
 * Returns null for relations the plan edge set does not carry.
 */
export function toPlanEdgeType(relationType: string): PlanEdgeType | null {
  return PLAN_EDGE_TYPES.has(relationType) ? (relationType as PlanEdgeType) : null;
}

/** Map onto the 5-value graph-plan edge vocabulary; unknown relations are dropped. */
export function toGraphPlanEdgeType(relationType: string): GraphPlanEdgeType | null {
  return GRAPH_EDGE_TYPES.has(relationType) ? (relationType as GraphPlanEdgeType) : null;
}

// ---------------------------------------------------------------------------
// Query label normalization (re-export for the service layer)
// ---------------------------------------------------------------------------

export { normalizeQuery as normalizeGraphPlanQuery };
