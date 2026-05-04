/**
 * v3 Graph-plan Smoke Datasets
 *
 * Smoke-tier cases for the additive GraphRAG-lite wrapper route
 * (`/v3/retrieval/search`).
 */

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '@trapmap/contracts';

export const v3GraphPlanSelectedSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-selected-smoke',
  tier: 'smoke',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'docker compose deployment guardrail',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'smoke-graph-plan-selected',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_graph_selected'],
      idealOrder: ['capsule_smoke_graph_selected'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      graphPlanExpectations: {
        expectedTrapNodeIds: ['trap:knowledge_smoke_graph_selected'],
        expectedSkillNodeIds: ['skill:artifact_smoke_graph_selected'],
        expectedEdges: [
          {
            sourceNodeId: 'skill:artifact_smoke_graph_selected',
            targetNodeId: 'trap:knowledge_smoke_graph_selected',
            type: 'mitigates',
          },
        ],
        expectedBlockingTrapNodeIds: ['trap:knowledge_smoke_graph_selected'],
        expectedRecommendedSkillNodeIds: ['skill:artifact_smoke_graph_selected'],
      },
    },
  },
  tags: ['smoke', 'v3', 'graph-plan', 'selected', 'structure', 'mitigates-edge'],
}) as RetrievalEvalCase;

export const v3GraphPlanFallbackV2Smoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-fallback-v2-smoke',
  tier: 'smoke',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'capsule fallback deployment guide',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'smoke-graph-plan-fallback-v2',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_graph_fallback_v2'],
      idealOrder: ['capsule_smoke_graph_fallback_v2'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {},
  },
  tags: ['smoke', 'v3', 'graph-plan', 'fallback-v2', 'route-reason'],
}) as RetrievalEvalCase;

export const v3GraphPlanFallbackV1Smoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v3-graph-plan-fallback-v1-smoke',
  tier: 'smoke',
  endpoint: '/v3/retrieval/search',
  request: {
    seed: 'trap blocker rollback',
    skillBudget: 3,
    maxDepth: 2,
    fallbackMode: 'auto',
  },
  scenarioId: 'smoke-graph-plan-fallback-v1',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_smoke_graph_fallback_v1'],
      idealOrder: ['knowledge_smoke_graph_fallback_v1'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {},
  },
  tags: ['smoke', 'v3', 'graph-plan', 'fallback-v1', 'route-reason'],
}) as RetrievalEvalCase;

export const v3GraphPlanSmokeCases: RetrievalEvalCase[] = [
  v3GraphPlanSelectedSmoke,
  v3GraphPlanFallbackV2Smoke,
  v3GraphPlanFallbackV1Smoke,
];
