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
import type { GraphQueryExpansionView } from '@trapmap/server/lib/graph-query/backend.js';
import { createMemoryGraphQueryBackend } from '@trapmap/server/lib/graph-query/memory-backend.js';
import type { Graph } from '@trapmap/server/lib/indexing/graph-lite/graphology.js';
import {
  isArtifactGovernanceEligible,
  rankCapsules,
} from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import { InMemoryIntentCache } from '@trapmap/server/lib/retrieval/capsules/intent-cache.js';
import { parseSeedIntentWithLLM } from '@trapmap/server/lib/retrieval/capsules/intent.js';
import { filterEligibleEntries } from '@trapmap/server/lib/retrieval/orchestration/filters.js';
import { buildRetrievalReadModel } from '@trapmap/server/lib/retrieval/read-model.js';
import type { ArtifactGovernanceFilters } from '@trapmap/server/lib/retrieval/types.js';
import type { CapsuleCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { selectQueryRelevantTraps } from './trap-ranking.js';

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
  const graphQueryBackend =
    services.graphQueryBackend ?? createMemoryGraphQueryBackend(services.repos.graphIndex);

  // 1. Parse seed intent
  const intent = await parseSeedIntentWithLLM(query.seed, services.ai.chat, {
    cache: planCompilerIntentCache,
  });

  // 2. Load store snapshot
  const readModel = await buildRetrievalReadModel(services.repos, services.store);

  // 3. Get governed trap candidates (from knowledgeEntries)
  const trapCandidates = filterEligibleEntries(readModel.knowledgeEntries, auth, {
    labels: [],
    scopes: [],
  });

  // 3a. Rank and filter traps by query relevance
  const rankedTrapSeeds = selectQueryRelevantTraps(trapCandidates, intent);

  // 4. Get governed skill candidates
  const governanceFilters = {
    teamId: auth.activeTeamId,
    securityLevel: auth.securityLevel,
    isSystemAdmin: auth.subjectType === 'system-admin',
    scopes: [] as Array<'global' | 'project'>,
    labels: [] as string[],
  };
  const governedArtifacts = readModel.skillArtifacts.filter((a) =>
    isArtifactGovernanceEligible(a, governanceFilters),
  );
  const skillCandidates = rankCapsules(
    governedArtifacts,
    intent,
    governanceFilters,
    query.skillBudget * 3, // Request more to allow dedupe and budget selection
  );

  // 5. Build seed node IDs from query-relevant traps and skill candidates
  const seedNodeIds = extractSeedNodeIds(
    rankedTrapSeeds.map((candidate) => candidate.entry),
    skillCandidates,
    await graphQueryBackend.getSourceNodeIds([
      ...rankedTrapSeeds.map((candidate) => candidate.entry.id),
      ...skillCandidates.map((candidate) => candidate.artifactId),
    ]),
  );

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

  // 6. Build local expansion view
  const expansionView = await graphQueryBackend.buildLocalExpansionView({
    seedNodeIds,
    maxDepth: query.maxDepth ?? DEFAULT_MAX_DEPTH,
    auth: {
      teamId: auth.activeTeamId,
      securityLevel: auth.securityLevel,
    },
  });

  // 7. Identify blocking traps
  const blockingTraps = findBlockingTraps(expansionView, trapCandidates, auth);

  // 8. Find mitigating skills
  const mitigatingSkillNodeIds = await graphQueryBackend.findMitigatingSkills(
    blockingTraps.map((t) => t.nodeId),
  );

  // 9. Apply skill budget with trap-mitigation priority
  const selectedSkills = applySkillBudget(
    skillCandidates,
    governedArtifacts,
    mitigatingSkillNodeIds,
    query.skillBudget ?? DEFAULT_SKILL_BUDGET,
    expansionView,
    blockingTraps.map((t) => t.nodeId),
  );

  // 10. Build edges
  const edges = buildPlanEdges(expansionView.graph, blockingTraps, selectedSkills);

  // 12. Build citations for demoted skills
  const citations = buildCitations(
    skillCandidates,
    selectedSkills,
    governedArtifacts,
    governanceFilters,
  );

  const graph = buildUnifiedGraph(blockingTraps, selectedSkills, expansionView.graph, citations);
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
 * Extract seed node IDs from trap and skill candidates using snapshot index.
 * Maps candidate IDs to graph node IDs via runtime.nodeIdsBySourceId.
 */
function extractSeedNodeIds(
  trapCandidates: KnowledgeRecord[],
  skillCandidates: CapsuleCandidate[],
  nodeIdsBySourceId: Map<string, Set<string>>,
): string[] {
  const nodeIds = new Set<string>();

  const trapIds = new Set(trapCandidates.map((t) => t.id));
  for (const trapId of trapIds) {
    for (const nodeId of nodeIdsBySourceId.get(trapId) ?? []) {
      nodeIds.add(nodeId);
    }
  }

  const skillIds = new Set(skillCandidates.map((s) => s.artifactId));
  for (const skillId of skillIds) {
    for (const nodeId of nodeIdsBySourceId.get(skillId) ?? []) {
      nodeIds.add(nodeId);
    }
  }

  return Array.from(nodeIds);
}

/**
 * Identify trap nodes with risk-blocks edges.
 * Promotes to PlanTrapNode with severity from edge strength.
 */
function findBlockingTraps(
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

/**
 * Apply skill budget, prioritizing trap-mitigating skills.
 * Returns exactly `budget` PlanSkillNode objects.
 */
function applySkillBudget(
  skillCandidates: CapsuleCandidate[],
  artifacts: SkillArtifactRecord[],
  mitigatingSkillNodeIds: string[],
  budget: number,
  expansionView: GraphQueryExpansionView,
  blockingTrapNodeIds: string[],
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
  for (const [nodeId, nodeView] of expansionView.nodeViewsById) {
    if (nodeView.sourceType === 'skill' && nodeView.node.kind === 'skill') {
      nodeIdToArtifactId.set(nodeId, nodeView.sourceId);
    }
  }

  // Build nodeId → mitigates mapping for direct mitigation check
  const nodeIdToMitigates = new Map<string, string[]>();
  for (const [nodeId, nodeView] of expansionView.nodeViewsById) {
    if (
      nodeView.sourceType === 'skill' &&
      nodeView.node.kind === 'skill' &&
      nodeView.node.mitigates &&
      nodeView.node.mitigates.length > 0
    ) {
      nodeIdToMitigates.set(nodeId, nodeView.node.mitigates);
    }
  }

  const blockingSet = new Set(blockingTrapNodeIds);

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

      const precomputedMitigates = nodeId ? nodeIdToMitigates.get(nodeId) : undefined;
      const scopedMitigates =
        precomputedMitigates?.some((trapId) => blockingSet.has(trapId)) ?? false;
      const isMitigating = nodeId
        ? scopedMitigates || mitigatingSkillNodeIds.includes(nodeId)
        : false;
      const mitigationBoost = isMitigating ? 0.5 : 0;
      const prioritizedScore = candidate.finalScore + mitigationBoost;

      return {
        candidate,
        artifact,
        nodeId,
        prioritizedScore,
        isMitigating,
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
    const nodeRecord = item.nodeId ? expansionView.nodeViewsById.get(item.nodeId)?.node : undefined;

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
  governanceFilters: ArtifactGovernanceFilters,
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
