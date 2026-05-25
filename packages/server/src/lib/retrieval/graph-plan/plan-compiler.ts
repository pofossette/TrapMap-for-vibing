/**
 * Trap-first plan compiler for Phase 37 GraphRAG-lite retrieval.
 * Merges trap and skill candidates into a minimal typed execution plan.
 *
 * Reuses:
 * - searchKnowledge: trap candidate retrieval (via filterEligibleEntries)
 * - rankCapsules: skill candidate retrieval
 * - buildLocalExpansionView: bounded graph expansion
 * - isArtifactGovernanceEligible: governance filtering
 */

import type {
  ExecutionStep,
  GraphPlan,
  GraphPlanGraphEdge,
  GraphPlanNode,
  PlanCitation,
  PlanEdge,
  PlanQuery,
  PlanSkillNode,
  PlanTrapNode,
  TrapFirstPlan,
} from '@trapmap/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import type { Graph } from '@trapmap/server/lib/indexing/graph-lite/graphology.js';
import { buildLocalExpansionView } from '@trapmap/server/lib/indexing/graph-lite/graphology.js';
import {
  isArtifactGovernanceEligible,
  rankCapsules,
} from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import { InMemoryIntentCache } from '@trapmap/server/lib/retrieval/capsules/intent-cache.js';
import { parseSeedIntentWithLLM } from '@trapmap/server/lib/retrieval/capsules/intent.js';
import { filterEligibleEntries } from '@trapmap/server/lib/retrieval/orchestration/filters.js';
import type { CapsuleCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';

// Constants
const DEFAULT_SKILL_BUDGET = 3;
const DEFAULT_MAX_DEPTH = 2;

const planCompilerIntentCache = new InMemoryIntentCache();

// ---------------------------------------------------------------------------
// Main compiler function
// ---------------------------------------------------------------------------

/**
 * Compile a trap-first execution plan from a query seed.
 *
 * Pipeline:
 * 1. Parse seed intent
 * 2. Load store snapshot
 * 3. Filter trap candidates (knowledgeEntries) by governance
 * 4. Rank skill candidates (skillArtifacts) using rankCapsules
 * 5. Load graph documents and build local expansion view
 * 6. Identify blocking traps (risk-blocks edges)
 * 7. Find mitigating skills (mitigates edges to traps)
 * 8. Apply skill budget with trap-mitigation priority
 * 9. Build plan output with edges and citations
 */
export async function compileTrapFirstPlan(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: PlanQuery,
): Promise<TrapFirstPlan> {
  // 1. Parse seed intent
  const intent = await parseSeedIntentWithLLM(query.seed, services.ai.chat, {
    cache: planCompilerIntentCache,
  });

  // 2. Load store snapshot
  const data = await services.store.snapshot();

  // 3. Get governed trap candidates (from knowledgeEntries)
  const trapCandidates = filterEligibleEntries(data.knowledgeEntries ?? [], auth, {
    labels: [],
    scopes: [],
  });

  // 4. Get governed skill candidates
  const governanceFilters = {
    teamId: auth.activeTeamId,
    securityLevel: auth.securityLevel,
    isSystemAdmin: auth.subjectType === 'system-admin',
  };
  const governedArtifacts = (data.skillArtifacts ?? []).filter((a) =>
    isArtifactGovernanceEligible(a, governanceFilters),
  );
  const skillCandidates = rankCapsules(
    governedArtifacts,
    intent,
    governanceFilters,
    query.skillBudget * 3, // Request more to allow dedupe and budget selection
  );

  // 5. Load graph documents
  const graphDocs = await services.repos.graphIndex.listAll();

  // 6. Build seed node IDs from candidates
  const seedNodeIds = extractSeedNodeIds(trapCandidates, skillCandidates, graphDocs);

  // Early return if no seeds
  if (seedNodeIds.length === 0) {
    return {
      blockingTraps: [],
      recommendedSkills: [],
      edges: [],
      citations: [],
      executionPlan: [],
      graph: {
        nodes: [],
        edges: [],
        citations: [],
        focus: {
          blockingTrapNodeIds: [],
          recommendedSkillNodeIds: [],
        },
      },
    };
  }

  // 7. Build local expansion view
  const expansionGraph = buildLocalExpansionView({
    documents: graphDocs,
    seedNodeIds,
    maxDepth: query.maxDepth ?? DEFAULT_MAX_DEPTH,
  });

  // 8. Identify blocking traps
  const blockingTraps = findBlockingTraps(expansionGraph, graphDocs, trapCandidates, auth);

  // 9. Find mitigating skills
  const mitigatingSkillNodeIds = findMitigatingSkills(
    expansionGraph,
    blockingTraps.map((t) => t.nodeId),
  );

  // 10. Apply skill budget with trap-mitigation priority
  const selectedSkills = applySkillBudget(
    skillCandidates,
    governedArtifacts,
    mitigatingSkillNodeIds,
    query.skillBudget ?? DEFAULT_SKILL_BUDGET,
    expansionGraph,
    graphDocs,
  );

  // 11. Build edges
  const edges = buildPlanEdges(expansionGraph, blockingTraps, selectedSkills);

  // 12. Build citations for demoted skills
  const citations = buildCitations(
    skillCandidates,
    selectedSkills,
    governedArtifacts,
    governanceFilters,
  );

  const graph = buildUnifiedGraph(blockingTraps, selectedSkills, expansionGraph, citations);
  const executionPlan = buildExecutionPlan(blockingTraps, selectedSkills, edges);

  return {
    blockingTraps,
    recommendedSkills: selectedSkills,
    edges,
    citations,
    executionPlan,
    graph,
  };
}

// ---------------------------------------------------------------------------
// Internal helper functions
// ---------------------------------------------------------------------------

/**
 * Extract seed node IDs from trap and skill candidates.
 * Maps candidate IDs to graph node IDs using document records.
 */
function extractSeedNodeIds(
  trapCandidates: KnowledgeRecord[],
  skillCandidates: CapsuleCandidate[],
  graphDocs: GraphIndexDocumentRecord[],
): string[] {
  const nodeIds = new Set<string>();

  // Map trap IDs to graph node IDs
  const trapIds = new Set(trapCandidates.map((t) => t.id));
  for (const doc of graphDocs) {
    if (doc.sourceType === 'trap' && trapIds.has(doc.sourceId)) {
      for (const node of doc.nodes) {
        if (node.kind === 'trap') {
          nodeIds.add(node.id);
        }
      }
    }
  }

  // Map skill IDs to graph node IDs
  const skillIds = new Set(skillCandidates.map((s) => s.artifactId));
  for (const doc of graphDocs) {
    if (doc.sourceType === 'skill' && skillIds.has(doc.sourceId)) {
      for (const node of doc.nodes) {
        if (node.kind === 'skill') {
          nodeIds.add(node.id);
        }
      }
    }
  }

  return Array.from(nodeIds);
}

/**
 * Identify trap nodes with risk-blocks edges.
 * Promotes to PlanTrapNode with severity from edge strength.
 */
function findBlockingTraps(
  graph: Graph,
  graphDocs: GraphIndexDocumentRecord[],
  trapCandidates: KnowledgeRecord[],
  auth: ResolvedAuthContext,
): PlanTrapNode[] {
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
      const doc = findDocForNode(graphDocs, node);
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

    const doc = findDocForNode(graphDocs, nodeId);
    if (!doc) continue;

    // Governance check (belt-and-suspenders)
    const candidate = trapCandidates.find((t) => t.id === doc.sourceId);
    if (!candidate) continue;
    if (candidate.requiredLevel > auth.securityLevel) continue;
    if (doc.requiredLevel > auth.securityLevel) continue;

    // Determine severity: prefer pre-computed, fallback to edge scanning
    const nodeRecord = doc.nodes.find((n) => n.id === nodeId);
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
      sourceId: doc.sourceId,
      label: attrs.label ?? nodeRecord?.label ?? 'Unknown trap',
      severity,
      scope: doc.scope,
      requiredLevel: doc.requiredLevel,
      evidence: nodeRecord?.evidence ?? doc.evidence,
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

/**
 * Find skill node IDs that mitigate identified trap nodes.
 * Looks for mitigates edges pointing to trap node IDs.
 */
function findMitigatingSkills(graph: Graph, trapNodeIds: string[]): string[] {
  const mitigatingSkillIds = new Set<string>();

  for (const trapNodeId of trapNodeIds) {
    graph.forEachEdge((_edgeKey, attributes, sourceNodeId, targetNodeId) => {
      if (attributes.relationType === 'mitigates' && targetNodeId === trapNodeId) {
        const sourceAttrs = graph.getNodeAttributes(sourceNodeId);
        if (sourceAttrs.kind === 'skill') {
          mitigatingSkillIds.add(sourceNodeId);
        }
      }
    });
  }

  return Array.from(mitigatingSkillIds);
}

/**
 * Apply skill budget, prioritizing trap-mitigating skills.
 * Returns exactly `budget` PlanSkillNode objects.
 */
function applySkillBudget(
  skillCandidates: CapsuleCandidate[],
  artifacts: SkillArtifactRecord[],
  mitigatingSkillNodeIds: string[],
  budget: number,
  _graph: Graph,
  graphDocs: GraphIndexDocumentRecord[],
): PlanSkillNode[] {
  if (skillCandidates.length === 0) {
    return [];
  }

  // Build artifact lookup
  const artifactById = new Map<string, SkillArtifactRecord>();
  for (const artifact of artifacts) {
    artifactById.set(artifact.id, artifact);
  }

  // Build node ID to artifact mapping
  const nodeIdToArtifactId = new Map<string, string>();
  const nodeToDoc = new Map<string, GraphIndexDocumentRecord>();
  for (const doc of graphDocs) {
    if (doc.sourceType === 'skill') {
      for (const node of doc.nodes) {
        if (node.kind === 'skill') {
          nodeIdToArtifactId.set(node.id, doc.sourceId);
          nodeToDoc.set(node.id, doc);
        }
      }
    }
  }

  // Score candidates with mitigation boost
  const scoredCandidates = skillCandidates
    .map((candidate) => {
      const artifact = artifactById.get(candidate.artifactId);
      if (!artifact) return null;

      // Find node ID for this candidate
      let nodeId: string | null = null;
      for (const [nid, aid] of nodeIdToArtifactId) {
        if (aid === candidate.artifactId) {
          nodeId = nid;
          break;
        }
      }

      // Boost score if mitigating a trap
      const mitigationBoost = nodeId && mitigatingSkillNodeIds.includes(nodeId) ? 0.5 : 0;
      const prioritizedScore = candidate.finalScore + mitigationBoost;

      return {
        candidate,
        artifact,
        nodeId,
        prioritizedScore,
        isMitigating: nodeId ? mitigatingSkillNodeIds.includes(nodeId) : false,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Sort by prioritized score (mitigating skills first among equal scores)
  scoredCandidates.sort((a, b) => {
    // Mitigating skills get priority
    if (a.isMitigating && !b.isMitigating) return -1;
    if (!a.isMitigating && b.isMitigating) return 1;
    return b.prioritizedScore - a.prioritizedScore;
  });

  // Limit to budget
  const selected = scoredCandidates.slice(0, budget);

  // Build PlanSkillNode objects
  return selected.map((item) => {
    const capsule = item.artifact.latestRevision.derived?.capsules.find(
      (c) => c.capsuleId === item.candidate.capsuleId,
    );
    const doc = item.nodeId ? nodeToDoc.get(item.nodeId) : null;
    const nodeRecord = doc?.nodes.find((n) => n.id === item.nodeId);

    return {
      nodeId: item.nodeId ?? `skill:${item.artifact.id}`,
      artifactId: item.artifact.id,
      capsuleId: item.candidate.capsuleId,
      label:
        capsule?.situation?.slice(0, 280) ??
        item.artifact.title ??
        nodeRecord?.label ??
        'Unknown skill',
      situation: capsule?.situation ?? '',
      problem: capsule?.problem ?? '',
      goal: capsule?.goal ?? '',
      scope: item.artifact.scope,
      requiredLevel: item.artifact.requiredLevel,
      score: item.candidate.finalScore,
      activationRefs: buildActivationRefs(item.artifact),
    };
  });
}

/**
 * Build plan edges from graph edges.
 * Only includes edges between nodes in the final plan.
 */
function buildPlanEdges(graph: Graph, traps: PlanTrapNode[], skills: PlanSkillNode[]): PlanEdge[] {
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

/**
 * Build citations for skills that were demoted by budget.
 * Only includes governance-approved sources.
 */
function buildCitations(
  allCandidates: CapsuleCandidate[],
  selectedSkills: PlanSkillNode[],
  artifacts: SkillArtifactRecord[],
  governanceFilters: { teamId: string | null; securityLevel: number; isSystemAdmin: boolean },
): PlanCitation[] {
  // Build set of selected artifact IDs
  const selectedArtifactIds = new Set(selectedSkills.map((s) => s.artifactId));

  // Build artifact lookup
  const artifactById = new Map<string, SkillArtifactRecord>();
  for (const artifact of artifacts) {
    artifactById.set(artifact.id, artifact);
  }

  // Build citations for demoted candidates
  const citations: PlanCitation[] = [];

  for (const candidate of allCandidates) {
    // Skip selected skills
    if (selectedArtifactIds.has(candidate.artifactId)) {
      continue;
    }

    const artifact = artifactById.get(candidate.artifactId);
    if (!artifact) continue;

    // Skip if not governance eligible (belt-and-suspenders)
    if (!isArtifactGovernanceEligible(artifact, governanceFilters)) {
      continue;
    }

    const capsule = artifact.latestRevision.derived?.capsules.find(
      (c) => c.capsuleId === candidate.capsuleId,
    );

    citations.push({
      sourceId: artifact.id,
      sourceKind: 'skill',
      label: capsule?.situation?.slice(0, 280) ?? artifact.title ?? 'Unknown skill',
      scope: artifact.scope,
      score: candidate.finalScore,
    });
  }

  // Sort by score descending
  return citations.sort((a, b) => b.score - a.score);
}

function buildActivationRefs(artifact: SkillArtifactRecord): PlanSkillNode['activationRefs'] {
  const manifest = artifact.latestRevision.derived?.clientManifest;

  if (!manifest) {
    return {
      references: [],
      assets: [],
      scripts: [],
    };
  }

  return {
    references: manifest.references,
    assets: manifest.assets,
    scripts: manifest.scripts,
  };
}

function buildUnifiedGraph(
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

/**
 * Build a topologically sorted execution plan from traps, skills, and edges.
 *
 * 排序语义：
 * - `mitigates` 边 (skill -> trap)：skill 必须在 trap 之前执行
 * - `requires` 边 (A -> B)：A 必须在 B 之前执行（硬依赖）
 * - `order` 边 (A -> B)：A 应在 B 之前执行（软排序）
 * - 无 mitigating 前置的 trap 放在 rank 0（按 severity 排序）
 * - 环路检测：无法拓扑排序的节点追加到末尾
 *
 * 设计参考：
 * - SkillGraph: TopoSort over prerequisite/enhancement edges
 * - GraSP: DAG compilation with state/data/order edges
 */
function buildExecutionPlan(
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

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Find the graph document containing a given node.
 */
function findDocForNode(
  graphDocs: GraphIndexDocumentRecord[],
  nodeId: string,
): GraphIndexDocumentRecord | undefined {
  for (const doc of graphDocs) {
    if (doc.nodes.some((n) => n.id === nodeId)) {
      return doc;
    }
  }
  return undefined;
}
