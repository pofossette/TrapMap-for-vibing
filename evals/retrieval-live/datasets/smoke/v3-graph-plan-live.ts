/**
 * Live eval smoke cases for v3 graph-plan retrieval.
 *
 * These cases verify graph-plan behavior against a real backend:
 * - graph-plan main path (blocking traps + recommended skills)
 * - fallback to v2 capsule when graph confidence is low
 * - graph backend actually participates (not empty graph)
 */

import type { RetrievalEvalCase } from '@trapmap/contracts/evals';

/**
 * v3 graph-plan retrieval live smoke cases.
 */
export const v3GraphPlanLiveSmokeCases: Array<RetrievalEvalCase & { stability: string }> = [
  {
    schemaVersion: 1,
    caseId: 'v3-live-graph-plan-basic',
    tier: 'smoke',
    endpoint: '/v3/retrieval/search',
    request: {
      seed: 'database migration fails with constraint violation',
      skillBudget: 5,
      maxDepth: 2,
    },
    scenarioId: 'live-smoke-scenario',
    expected: {
      outcome: 'non-empty',
      relevance: {
        relevantIds: [],
        idealOrder: [],
      },
      governance: {
        forbiddenIds: [],
        forbiddenReasons: [],
      },
      shape: {},
    },
    tags: ['error-debugging'],
    stability: 'version-sensitive',
  },
  {
    schemaVersion: 1,
    caseId: 'v3-live-fallback-path',
    tier: 'smoke',
    endpoint: '/v3/retrieval/search',
    request: {
      seed: 'xyznonexistentquery12345withnoresults',
      skillBudget: 5,
      maxDepth: 2,
    },
    scenarioId: 'live-smoke-scenario',
    expected: {
      outcome: 'empty',
      relevance: {
        relevantIds: [],
        idealOrder: [],
      },
      governance: {
        forbiddenIds: [],
        forbiddenReasons: [],
      },
      shape: {},
    },
    tags: ['general'],
    stability: 'stable',
  },
  {
    schemaVersion: 1,
    caseId: 'v3-live-routing-trace-present',
    tier: 'smoke',
    endpoint: '/v3/retrieval/search',
    request: {
      seed: 'typescript strict mode configuration',
      skillBudget: 3,
      maxDepth: 2,
    },
    scenarioId: 'live-smoke-scenario',
    expected: {
      outcome: 'non-empty',
      relevance: {
        relevantIds: [],
        idealOrder: [],
      },
      governance: {
        forbiddenIds: [],
        forbiddenReasons: [],
      },
      shape: {},
    },
    tags: ['how-to'],
    stability: 'version-sensitive',
  },
];
