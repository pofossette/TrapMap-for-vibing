/**
 * v3 Graph-plan Core Datasets
 *
 * Core-tier cases for the additive GraphRAG-lite wrapper route
 * (`/v3/retrieval/search`).
 */

import {
  type RetrievalEvalCase,
  retrievalEvalCaseSchema,
} from '@trapmap/contracts';

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
    shape: {},
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

export const v3GraphPlanCoreCases: RetrievalEvalCase[] = [
  v3GraphPlanSelectedCore,
  v3GraphPlanGovernanceCore,
];
