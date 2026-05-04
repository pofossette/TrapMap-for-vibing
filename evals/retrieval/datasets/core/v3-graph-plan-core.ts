/**
 * v3 Graph-plan Core Datasets
 *
 * Core-tier cases for the additive GraphRAG-lite wrapper route
 * (`/v3/retrieval/search`).
 */

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '@trapmap/contracts';

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

export const v3GraphPlanCoreCases: RetrievalEvalCase[] = [
  v3GraphPlanSelectedCore,
  v3GraphPlanGovernanceCore,
  v3GraphPlanOrchestrationCore,
];
