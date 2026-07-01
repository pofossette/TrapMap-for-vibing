/**
 * Execution plan builder with topological sorting.
 *
 * Builds a topologically sorted execution plan from traps, skills, and edges.
 *
 * Sorting semantics:
 * - `mitigates` edges (skill -> trap): skill must execute before trap
 * - `requires` edges (A -> B): A must execute before B (hard dependency)
 * - `order` edges (A -> B): A should execute before B (soft ordering)
 * - Traps without mitigating prerequisites go at rank 0 (sorted by severity)
 * - Cycle detection: nodes that cannot be topologically sorted are appended at the end
 *
 * Design references:
 * - SkillGraph: TopoSort over prerequisite/enhancement edges
 * - GraSP: DAG compilation with state/data/order edges
 */

import type { ExecutionStep, PlanEdge, PlanSkillNode, PlanTrapNode } from '@trapmap/contracts';

/**
 * Build a topologically sorted execution plan from traps, skills, and edges.
 */
export function buildExecutionPlan(
  traps: PlanTrapNode[],
  skills: PlanSkillNode[],
  edges: PlanEdge[],
): ExecutionStep[] {
  const allNodes = [
    ...traps.map((t) => ({
      nodeId: t.nodeId,
      label: t.label,
      kind: 'trap-mitigation' as const,
      score: t.score,
      severity: t.severity,
    })),
    ...skills.map((s) => ({
      nodeId: s.nodeId,
      label: s.label,
      kind: 'skill' as const,
      score: s.score,
      severity: 'soft' as const,
    })),
  ];

  if (allNodes.length === 0) {
    return [];
  }

  const nodeById = new Map(allNodes.map((n) => [n.nodeId, n]));

  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const blockedByMap = new Map<string, string[]>();

  for (const node of allNodes) {
    outgoing.set(node.nodeId, []);
    indegree.set(node.nodeId, 0);
    blockedByMap.set(node.nodeId, []);
  }

  const depEdgeTypes = new Set(['mitigates', 'requires', 'order']);

  for (const edge of edges) {
    if (!depEdgeTypes.has(edge.type)) continue;
    if (!nodeById.has(edge.sourceNodeId) || !nodeById.has(edge.targetNodeId)) continue;

    outgoing.get(edge.sourceNodeId)!.push(edge.targetNodeId);
    indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1);
    blockedByMap.get(edge.targetNodeId)!.push(edge.sourceNodeId);
  }

  const queue: string[] = [];
  for (const node of allNodes) {
    if ((indegree.get(node.nodeId) ?? 0) === 0) {
      queue.push(node.nodeId);
    }
  }

  queue.sort((a, b) => {
    const na = nodeById.get(a)!;
    const nb = nodeById.get(b)!;
    if (na.severity === 'hard' && nb.severity !== 'hard') return -1;
    if (na.severity !== 'hard' && nb.severity === 'hard') return 1;
    return nb.score - na.score;
  });

  const rankMap = new Map<string, number>();
  const ordered: string[] = [];

  for (const nodeId of queue) {
    rankMap.set(nodeId, 0);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    ordered.push(nodeId);

    const targets = outgoing.get(nodeId) ?? [];
    for (const targetId of targets) {
      const newIndegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, newIndegree);

      const currentRank = rankMap.get(targetId) ?? 0;
      const predecessorRank = rankMap.get(nodeId) ?? 0;
      rankMap.set(targetId, Math.max(currentRank, predecessorRank + 1));

      if (newIndegree === 0) {
        queue.push(targetId);
      }
    }

    queue.sort((a, b) => {
      const rankDiff = (rankMap.get(a) ?? 0) - (rankMap.get(b) ?? 0);
      if (rankDiff !== 0) return rankDiff;
      const na = nodeById.get(a)!;
      const nb = nodeById.get(b)!;
      if (na.severity === 'hard' && nb.severity !== 'hard') return -1;
      if (na.severity !== 'hard' && nb.severity === 'hard') return 1;
      return nb.score - na.score;
    });
  }

  const orderedSet = new Set(ordered);
  for (const node of allNodes) {
    if (!orderedSet.has(node.nodeId)) {
      ordered.push(node.nodeId);
      rankMap.set(node.nodeId, allNodes.length);
    }
  }

  return ordered.map((nodeId) => {
    const node = nodeById.get(nodeId)!;
    return {
      rank: rankMap.get(nodeId) ?? 0,
      nodeId: node.nodeId,
      label: node.label,
      kind: node.kind,
      blockedBy: blockedByMap.get(nodeId) ?? [],
    };
  });
}
