/**
 * v1 Retrieval Smoke Datasets
 *
 * Smoke-tier cases for legacy bucketed retrieval (`/v1/retrieval/search`).
 * Covers: positive hit, empty result, and forbidden result scenarios.
 *
 * v1 response shape: { globalConstraints, projectKnowledge, refinementSummary, summary }
 *
 * Phase 25-02: REVAL-02
 */

import {
  retrievalEvalCaseSchema,
  type RetrievalEvalCase,
} from '../../../../packages/contracts/src/index.js';

// =============================================================================
// v1 Smoke: Positive Visible Hit
// =============================================================================

/**
 * Case: Search for docker knowledge, expect one approved visible entry.
 */
export const v1SemanticPositiveSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-semantic-positive-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'docker compose multi-container setup',
    mode: 'semantic',
    maxResults: 10,
  },
  scenarioId: 'smoke-positive-visible',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_smoke_approved'],
      idealOrder: ['knowledge_smoke_approved'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: ['knowledge_smoke_approved'],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['positive', 'v1', 'smoke', 'semantic'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Smoke: Empty Result
// =============================================================================

/**
 * Case: Search for non-existent knowledge, expect empty result.
 */
export const v1SemanticEmptySmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-semantic-empty-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'quantum computing neural network fusion',
    mode: 'semantic',
    maxResults: 10,
  },
  scenarioId: 'smoke-empty-result',
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
    shape: {
      bucketExpectations: {
        projectKnowledge: [],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['empty', 'v1', 'smoke', 'semantic'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Smoke: Forbidden Result (Governance Filtering)
// =============================================================================

/**
 * Case: Search for API rate limiting, expect forbidden entries filtered out.
 * All matching entries are forbidden: cross-team, security-level, or lifecycle.
 */
export const v1SemanticForbiddenSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-semantic-forbidden-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'REST API rate limiting credentials testing',
    mode: 'semantic',
    maxResults: 10,
  },
  scenarioId: 'smoke-forbidden',
  expected: {
    outcome: 'empty',
    relevance: {
      relevantIds: [
        // These would be relevant by content, but are forbidden by governance
        'knowledge_smoke_other_team',
        'knowledge_smoke_high_level',
        'knowledge_smoke_pending',
      ],
      idealOrder: [],
    },
    governance: {
      forbiddenIds: [
        'knowledge_smoke_other_team', // cross-team
        'knowledge_smoke_high_level', // security-level
        'knowledge_smoke_pending', // lifecycle
      ],
      forbiddenReasons: ['cross-team', 'security-level', 'lifecycle'],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: [],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['forbidden', 'v1', 'smoke', 'semantic', 'governance'],
}) as RetrievalEvalCase;

// =============================================================================
// Aggregated v1 Smoke Cases Export
// =============================================================================

/**
 * All v1 smoke-tier retrieval eval cases.
 */
export const v1RetrievalSmokeCases: RetrievalEvalCase[] = [
  v1SemanticPositiveSmoke,
  v1SemanticEmptySmoke,
  v1SemanticForbiddenSmoke,
];
