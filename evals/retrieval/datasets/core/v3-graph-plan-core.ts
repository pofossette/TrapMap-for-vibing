/**
 * v3 Graph-plan Core Datasets
 *
 * Core-tier cases for the additive GraphRAG-lite wrapper route
 * (`/v3/retrieval/search`).
 */

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '@trapmap/contracts/evals';

export const v3GraphPlanSelectedCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-selected-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'docker deployment compose rollback safety',
    skillBudget: 2,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-graph-plan-selected',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_graph_selected_primary', 'capsule_core_graph_selected_secondary'],
      idealOrder: ['capsule_core_graph_selected_primary', 'capsule_core_graph_selected_secondary'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: ['trap:knowledge_core_graph_selected'],
        expectedSkillNodeIds: [
          'skill:artifact_core_graph_selected_primary',
          'skill:artifact_core_graph_selected_secondary',
        ],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_core_graph_selected_primary',
            targetNodeId: 'trap:knowledge_core_graph_selected',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_graph_selected_secondary',
            targetNodeId: 'trap:knowledge_core_graph_selected',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_graph_selected_primary',
            targetNodeId: 'skill:artifact_core_graph_selected_secondary',
            type: 'requires',
          },
        ],
        expectedBlockingTrapNodeIds: ['trap:knowledge_core_graph_selected'],
        expectedRecommendedSkillNodeIds: [
          'skill:artifact_core_graph_selected_primary',
          'skill:artifact_core_graph_selected_secondary',
        ],
      },
    },
  },
  tags: ['core', 'v3', 'graph-plan', 'selected', 'multi-hit', 'how-to'],
}) as RetrievalEvalCase;

export const v3GraphPlanGovernanceCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-governance-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'api governance rollout',
    skillBudget: 2,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-graph-plan-governance',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_graph_governed_allowed'],
      idealOrder: ['capsule_core_graph_governed_allowed'],
    },
    governance: {
      forbiddenIds: [
        'capsule_core_graph_governed_other_team',
        'capsule_core_graph_governed_high_level',
      ],
      forbiddenReasons: ['cross-team', 'security-level'],
    },
    shape: {},
  },
  tags: ['core', 'v3', 'graph-plan', 'governance-sensitive', 'route-reason'],
}) as RetrievalEvalCase;

export const v3GraphPlanOrchestrationCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-orchestration-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'deployment ordering infrastructure application',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-graph-plan-orchestration',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_orchestration_infra', 'capsule_core_orchestration_deploy'],
      idealOrder: ['capsule_core_orchestration_infra', 'capsule_core_orchestration_deploy'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: ['trap:knowledge_core_orchestration_trap'],
        expectedSkillNodeIds: [
          'skill:artifact_core_orchestration_infra',
          'skill:artifact_core_orchestration_deploy',
        ],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_core_orchestration_infra',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'skill:artifact_core_orchestration_infra',
            type: 'order',
          },
        ],
        expectedBlockingTrapNodeIds: ['trap:knowledge_core_orchestration_trap'],
        expectedRecommendedSkillNodeIds: [
          'skill:artifact_core_orchestration_infra',
          'skill:artifact_core_orchestration_deploy',
        ],
      },
    },
  },
  tags: ['core', 'v3', 'graph-plan', 'orchestration', 'order-edge', 'multi-skill'],
}) as RetrievalEvalCase;

// =============================================================================
// v3 Core: Multi-Trap Blocking
// =============================================================================

/**
 * Case: Two independent traps each mitigated by a separate skill.
 * Tests multi-trap detection and per-trap routing in graph plan.
 */
export const v3GraphPlanMultiTrapCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-multi-trap-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'memory leak CSS z-index frontend traps',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-graph-plan-multi-trap',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_multi_trap_cleanup', 'capsule_core_multi_trap_zindex'],
      idealOrder: ['capsule_core_multi_trap_cleanup', 'capsule_core_multi_trap_zindex'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: [
          'trap:knowledge_core_multi_trap_memory',
          'trap:knowledge_core_multi_trap_css',
        ],
        expectedSkillNodeIds: [
          'skill:artifact_core_multi_trap_cleanup',
          'skill:artifact_core_multi_trap_zindex',
        ],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_core_multi_trap_cleanup',
            targetNodeId: 'trap:knowledge_core_multi_trap_memory',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_multi_trap_zindex',
            targetNodeId: 'trap:knowledge_core_multi_trap_css',
            type: 'mitigates',
          },
        ],
        expectedBlockingTrapNodeIds: [
          'trap:knowledge_core_multi_trap_memory',
          'trap:knowledge_core_multi_trap_css',
        ],
        expectedRecommendedSkillNodeIds: [
          'skill:artifact_core_multi_trap_cleanup',
          'skill:artifact_core_multi_trap_zindex',
        ],
      },
    },
  },
  tags: ['core', 'v3', 'graph-plan', 'multi-trap', 'mitigates-edge', 'frontend'],
}) as RetrievalEvalCase;

// =============================================================================
// v3 Core: Co-Occurs Edge
// =============================================================================

/**
 * Case: Two skills with co-occurs-with edge, both mitigating same trap.
 * Tests co-occurs-with edge type recognition in graph plan.
 */
export const v3GraphPlanCoOccursCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-co-occurs-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'flaky test retry isolation CI',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-graph-plan-co-occurs',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_co_occurs_retry', 'capsule_core_co_occurs_isolate'],
      idealOrder: ['capsule_core_co_occurs_isolate', 'capsule_core_co_occurs_retry'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: ['trap:knowledge_core_co_occurs_trap'],
        expectedSkillNodeIds: [
          'skill:artifact_core_co_occurs_retry',
          'skill:artifact_core_co_occurs_isolate',
        ],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_core_co_occurs_retry',
            targetNodeId: 'trap:knowledge_core_co_occurs_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_co_occurs_isolate',
            targetNodeId: 'trap:knowledge_core_co_occurs_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_co_occurs_isolate',
            targetNodeId: 'skill:artifact_core_co_occurs_retry',
            type: 'co-occurs-with',
          },
        ],
        expectedBlockingTrapNodeIds: ['trap:knowledge_core_co_occurs_trap'],
        expectedRecommendedSkillNodeIds: [
          'skill:artifact_core_co_occurs_isolate',
          'skill:artifact_core_co_occurs_retry',
        ],
      },
    },
  },
  tags: ['core', 'v3', 'graph-plan', 'co-occurs-edge', 'testing'],
}) as RetrievalEvalCase;

// =============================================================================
// v3 Core: Empty Graph Fallback
// =============================================================================

/**
 * Case: Search with core scenario that has no graph documents.
 * Should fall back to non-graph-plan path.
 */
export const v3GraphPlanEmptyGraphCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-empty-graph-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'trap blocker rollback',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-ranked-hits',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_core_docker_primary', 'knowledge_core_docker_secondary'],
      idealOrder: ['knowledge_core_docker_primary', 'knowledge_core_docker_secondary'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {},
  },
  tags: ['core', 'v3', 'graph-plan', 'fallback', 'route-reason'],
}) as RetrievalEvalCase;

// =============================================================================
// v3 Core: Requires Edge
// =============================================================================

/**
 * Case: Skill B requires Skill A (prerequisite dependency).
 * Tests requires edge type and dependency chain in graph plan.
 */
export const v3GraphPlanRequiresEdgeCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-requires-edge-core',
  tier: 'core',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'kubernetes OOM kill resource limits monitoring',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'core-graph-plan-requires',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_requires_limits', 'capsule_core_requires_monitoring'],
      idealOrder: ['capsule_core_requires_limits', 'capsule_core_requires_monitoring'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: ['trap:knowledge_core_requires_trap'],
        expectedSkillNodeIds: [
          'skill:artifact_core_requires_limits',
          'skill:artifact_core_requires_monitoring',
        ],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_core_requires_limits',
            targetNodeId: 'trap:knowledge_core_requires_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_requires_monitoring',
            targetNodeId: 'trap:knowledge_core_requires_trap',
            type: 'mitigates',
          },
          {
            sourceNodeId: 'skill:artifact_core_requires_monitoring',
            targetNodeId: 'skill:artifact_core_requires_limits',
            type: 'requires',
          },
        ],
        expectedBlockingTrapNodeIds: ['trap:knowledge_core_requires_trap'],
        expectedRecommendedSkillNodeIds: [
          'skill:artifact_core_requires_limits',
          'skill:artifact_core_requires_monitoring',
        ],
      },
    },
  },
  tags: ['core', 'v3', 'graph-plan', 'requires-edge', 'infrastructure'],
}) as RetrievalEvalCase;

export const v3GraphPlanCoreCases: RetrievalEvalCase[] = [
  v3GraphPlanSelectedCore,
  v3GraphPlanGovernanceCore,
  v3GraphPlanOrchestrationCore,
  v3GraphPlanMultiTrapCore,
  v3GraphPlanCoOccursCore,
  v3GraphPlanEmptyGraphCore,
  v3GraphPlanRequiresEdgeCore,
];
