/**
 * Identify blocking traps from a graph expansion view.
 * Promotes trap nodes with risk-blocks edges to PlanTrapNode with severity.
 */

import type { PlanTrapNode } from '@trapmap/contracts';
import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import type { GraphQueryExpansionView } from '@trapmap/contracts';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

/**
 * Identify trap nodes with risk-blocks edges.
 * Promotes to PlanTrapNode with severity from edge strength.
 */
export function findBlockingTraps(
  expansionView: GraphQueryExpansionView,
  trapCandidates: KnowledgeRecord[],
  auth: ResolvedAuthContext,
): PlanTrapNode[] {
  const graph = expansionView.graph;
  const traps: PlanTrapNode[] = [];
  const trapNodeIds = new Set<string>();

  // Find all trap nodes with risk-blocks edges
  graph.forEachEdge((_edgeKey, attributes, sourceNodeId, _targetNodeId) => {
    if (attributes.relationType === 'risk-blocks') {
      // The source of risk-blocks is the trap that blocks execution
      trapNodeIds.add(sourceNodeId);
    }
  });

  // Also include trap nodes that are seeds (candidates)
  for (const node of graph.nodes()) {
    const attrs = graph.getNodeAttributes(node);
    if (attrs.kind === 'trap') {
      // Check if this trap is in our candidates
      const doc = expansionView.nodeViewsById.get(node);
      if (doc && trapCandidates.some((t) => t.id === doc.sourceId)) {
        trapNodeIds.add(node);
      }
    }
  }

  // Build PlanTrapNode for each trap
  for (const nodeId of trapNodeIds) {
    if (!graph.hasNode(nodeId)) continue;

    const attrs = graph.getNodeAttributes(nodeId);
    if (attrs.kind !== 'trap') continue;

    const nodeView = expansionView.nodeViewsById.get(nodeId);
    if (!nodeView) continue;

    // Governance check (belt-and-suspenders)
    const candidate = trapCandidates.find((t) => t.id === nodeView.sourceId);
    if (!candidate) continue;
    if (candidate.requiredLevel > auth.securityLevel) continue;
    if (nodeView.requiredLevel > auth.securityLevel) continue;

    // Determine severity: prefer pre-computed, fallback to edge scanning
    const nodeRecord = nodeView.node;
    let severity: 'hard' | 'soft' = nodeRecord?.severity ?? 'soft';
    if (!nodeRecord?.severity) {
      // Fallback for old graph documents without pre-computed severity
      graph.forEachEdge(nodeId, (_edgeKey, attributes) => {
        if (attributes.relationType === 'risk-blocks' && attributes.strength === 'hard') {
          severity = 'hard';
        }
      });
    }

    traps.push({
      nodeId,
      sourceId: nodeView.sourceId,
      label: attrs.label ?? nodeRecord?.label ?? 'Unknown trap',
      severity,
      scope: nodeView.scope,
      requiredLevel: nodeView.requiredLevel,
      evidence: nodeRecord.evidence ?? nodeView.documentEvidence,
      score: 1.0, // Base score for being a candidate
    });
  }

  // Sort by severity (hard first), then by score
  return traps.sort((a, b) => {
    if (a.severity === 'hard' && b.severity !== 'hard') return -1;
    if (a.severity !== 'hard' && b.severity === 'hard') return 1;
    return b.score - a.score;
  });
}
