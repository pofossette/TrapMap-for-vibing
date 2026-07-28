/**
 * Trap-first plan compiler for Phase 37 GraphRAG-lite retrieval.
 * Merges trap and skill candidates into a minimal typed execution plan.
 *
 * Reuses:
 * - searchKnowledge: trap candidate retrieval (via filterEligibleEntries)
 * - rankCapsules: skill candidate retrieval
 * - buildLocalExpansionView: bounded graph expansion
 * - isArtifactGovernanceEligible: governance filtering
 *
 * Sub-modules:
 * - trap-identification: findBlockingTraps
 * - skill-selection: applySkillBudget, buildActivationRefs
 * - plan-edges: buildPlanEdges
 * - plan-citations: buildCitations
 * - plan-graph: buildUnifiedGraph
 * - execution-plan: buildExecutionPlan
 */

import type { PlanQuery, TrapFirstPlan } from '@trapmap/contracts';
import { createMemoryGraphQueryBackend } from '@trapmap/service-knowledge-read';

import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import {
  isArtifactGovernanceEligible,
  rankCapsules,
} from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import { InMemoryIntentCache } from '@trapmap/server/lib/retrieval/capsules/intent-cache.js';
import { parseSeedIntentWithLLM } from '@trapmap/server/lib/retrieval/capsules/intent.js';
import { filterEligibleEntries } from '@trapmap/server/lib/retrieval/orchestration/index.js';
import { buildRetrievalReadModel } from '@trapmap/server/lib/retrieval/read-model.js';
import type { CapsuleCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { buildExecutionPlan } from './execution-plan.js';
import { buildCitations } from './plan-citations.js';
import { buildPlanEdges } from './plan-edges.js';
import { buildUnifiedGraph } from './plan-graph.js';
import { applySkillBudget } from './skill-selection.js';
import { findBlockingTraps } from './trap-identification.js';
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
  const readModel = await buildRetrievalReadModel(services.repos);

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
