/**
 * Unified graph assembly for plan compilation.
 * Combines traps, skills, edges, and citations into a GraphPlan structure.
 */

import type {
  GraphPlan,
  GraphPlanGraphEdge,
  GraphPlanNode,
  PlanCitation,
  PlanSkillNode,
  PlanTrapNode,
} from '@trapmap/contracts';
import type { Graph } from '@trapmap/server/lib/indexing/graph-lite/index.js';

/**
 * Build a unified graph plan from traps, skills, graph edges, and citations.
 */
export function buildUnifiedGraph(
  traps: PlanTrapNode[],
  skills: PlanSkillNode[],
  graph: Graph,
  citations: PlanCitation[],
): GraphPlan {
  const nodes: GraphPlanNode[] = [
    ...traps.map((trap) => ({ kind: 'trap' as const, ...trap })),
    ...skills.map((skill) => ({ kind: 'skill' as const, ...skill })),
  ];
  const nodeIds = new Set(nodes.map((node) => node.nodeId));

  const edges: GraphPlanGraphEdge[] = [];
  graph.forEachEdge((edgeKey, attributes, sourceNodeId, targetNodeId) => {
    if (!nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) {
      return;
    }

    const edgeType = attributes.relationType as GraphPlanGraphEdge['type'];
    if (!['risk-blocks', 'mitigates', 'requires', 'order', 'co-occurs-with'].includes(edgeType)) {
      return;
    }

    edges.push({
      id: edgeKey,
      sourceNodeId,
      targetNodeId,
      type: edgeType,
      strength: attributes.strength as GraphPlanGraphEdge['strength'],
    });
  });

  return {
    nodes,
    edges,
    citations,
    focus: {
      blockingTrapNodeIds: traps.map((trap) => trap.nodeId),
      recommendedSkillNodeIds: skills.map((skill) => skill.nodeId),
    },
  };
}
