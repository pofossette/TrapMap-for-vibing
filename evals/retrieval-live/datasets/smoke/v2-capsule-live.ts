/**
 * Live eval smoke cases for v2 capsule retrieval.
 *
 * These cases are designed to run against a real TrapMap backend with
 * snapshot-restored data. Assertions focus on user-visible behavior:
 * governance, outcome, and basic ranking stability.
 */

import type { RetrievalEvalCase } from '../../../types/index.js';

/**
 * v2 capsule retrieval live smoke cases.
 * Scenario IDs reference scenarios in the snapshot's fixture set.
 *
 * Each case carries a `stability` tag (via the live case extension):
 * - stable: governance + outcome assertions that must pass on any snapshot version
 * - version-sensitive: ranking assertions used for cross-version comparison
 */
export const v2CapsuleLiveSmokeCases: Array<RetrievalEvalCase & { stability: string }> = [
  {
    schemaVersion: 1,
    caseId: 'v2-live-basic-hit',
    tier: 'smoke',
    endpoint: '/v2/retrieval/search',
    request: {
      seed: 'how to configure postgresql connection pooling',
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
  {
    schemaVersion: 1,
    caseId: 'v2-live-governance-level',
    tier: 'smoke',
    endpoint: '/v2/retrieval/search',
    request: {
      seed: 'docker container deployment',
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
    stability: 'stable',
  },
  {
    schemaVersion: 1,
    caseId: 'v2-live-empty-query',
    tier: 'smoke',
    endpoint: '/v2/retrieval/search',
    request: {
      seed: 'xyznonexistentquery12345withnoresults',
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
];
