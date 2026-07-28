/**
 * Plan edge construction from graph expansion view.
 * Filters graph edges to only include plan-relevant edge types between plan nodes.
 */

import type { PlanEdge, PlanSkillNode, PlanTrapNode } from '@trapmap/contracts';
import type { Graph } from '@trapmap/service-knowledge-read';

/**
 * Build plan edges from graph edges.
 * Only includes edges between nodes in the final plan.
 */
export function buildPlanEdges(
  graph: Graph,
  traps: PlanTrapNode[],
  skills: PlanSkillNode[],
): PlanEdge[] {
  const edges: PlanEdge[] = [];

  // Build set of plan node IDs
  const planNodeIds = new Set([...traps.map((t) => t.nodeId), ...skills.map((s) => s.nodeId)]);

  // Collect edges between plan nodes
  graph.forEachEdge((edgeKey, attributes, sourceNodeId, targetNodeId) => {
    // Only include edges where both nodes are in the plan
    if (!planNodeIds.has(sourceNodeId) || !planNodeIds.has(targetNodeId)) {
      return;
    }

    // Only include plan-relevant edge types
    const planEdgeTypes = ['risk-blocks', 'mitigates', 'requires', 'order'];
    const relationType = attributes.relationType;
    if (!relationType || !planEdgeTypes.includes(relationType)) {
      return;
    }

    edges.push({
      id: edgeKey,
      sourceNodeId,
      targetNodeId,
      type: relationType as PlanEdge['type'],
      strength: attributes.strength as PlanEdge['strength'],
    });
  });

  return edges;
}
