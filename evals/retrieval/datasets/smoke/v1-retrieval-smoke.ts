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

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '../../../types/index.js';

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
  tags: ['positive', 'v1', 'smoke', 'semantic', 'general'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Smoke: Empty Result
// =============================================================================

/**
 * Case: Search for non-existent knowledge, expect empty result.
 * Note: Using a very specific query that won't match any terms in the unrelated fixture.
 */
export const v1SemanticEmptySmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-semantic-empty-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'xyzzy123 nonexistent query plugh456',
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
  tags: ['empty', 'v1', 'smoke', 'semantic', 'general'],
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
  tags: ['forbidden', 'v1', 'smoke', 'semantic', 'governance', 'governance-sensitive'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Smoke: Hybrid Mode Positive Hit
// =============================================================================

/**
 * Case: Search for docker knowledge using hybrid mode.
 * Hybrid combines semantic and keyword search.
 */
export const v1HybridPositiveSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-hybrid-positive-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'docker compose multi-container setup',
    mode: 'hybrid',
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
  tags: ['positive', 'v1', 'smoke', 'hybrid', 'general'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Smoke: Graph-Assisted Mode Positive Hit
// =============================================================================

/**
 * Case: Search for docker knowledge using graph-assisted mode.
 * Graph-assisted leverages relationship information for retrieval.
 */
export const v1GraphAssistedPositiveSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-graph-assisted-positive-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'docker compose multi-container setup',
    mode: 'graph-assisted',
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
  tags: ['positive', 'v1', 'smoke', 'graph-assisted', 'general'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Smoke: Skill Lookup Positive Hit
// =============================================================================

/**
 * Case: Search for docker skill content, expect one governed artifact-first match.
 */
export const v1SkillLookupPositiveSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-skill-lookup-positive-smoke',
  tier: 'smoke',
  endpoint: '/v1/retrieval/skills/search-by-content',
  request: {
    seed: 'docker compose multi-container setup',
    maxResults: 10,
  },
  scenarioId: 'smoke-positive-visible',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['artifact_smoke_approved'],
      idealOrder: ['artifact_smoke_approved'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedArtifactIds: ['artifact_smoke_approved'],
    },
  },
  tags: ['positive', 'v1', 'smoke', 'skill-lookup', 'capsule', 'general'],
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
  v1HybridPositiveSmoke,
  v1GraphAssistedPositiveSmoke,
  v1SkillLookupPositiveSmoke,
];
