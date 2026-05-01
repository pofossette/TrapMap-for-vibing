/**
 * v2 Retrieval Smoke Datasets
 *
 * Smoke-tier cases for capsule-first retrieval (`/v2/retrieval/search`).
 * Covers: positive hit, empty result, and forbidden result scenarios.
 *
 * v2 response shape: { capsules, profileHints, refinementSummary, summary }
 *
 * Phase 25-02: REVAL-02
 */

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '@trapmap/contracts';

// =============================================================================
// v2 Smoke: Positive Visible Hit
// =============================================================================

/**
 * Case: Search for docker knowledge, expect one eligible capsule with profile hints.
 */
export const v2CapsulePositiveSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-capsule-positive-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker compose multi-container setup',
    maxResults: 10,
  },
  scenarioId: 'smoke-positive-visible',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_docker'],
      idealOrder: ['capsule_smoke_docker'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_smoke_approved'],
      expectedCapsuleCount: 1,
    },
  },
  tags: ['positive', 'v2', 'smoke', 'capsule', 'general'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Smoke: Empty Result
// =============================================================================

/**
 * Case: Search for non-existent knowledge, expect no capsules.
 * Note: Using a very specific query that won't match any terms in the unrelated fixture.
 */
export const v2CapsuleEmptySmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-capsule-empty-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'xyzzy123 nonexistent query plugh456',
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
      expectedProfileHintArtifactIds: [],
      expectedCapsuleCount: 0,
    },
  },
  tags: ['empty', 'v2', 'smoke', 'capsule', 'general'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Smoke: Forbidden Result (Governance Filtering)
// =============================================================================

/**
 * Case: Search for API/security/testing knowledge, expect forbidden capsules filtered.
 * All matching capsules are forbidden: cross-team, security-level, or lifecycle.
 */
export const v2CapsuleForbiddenSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-capsule-forbidden-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'rate limiting credentials testing',
    maxResults: 10,
  },
  scenarioId: 'smoke-forbidden',
  expected: {
    outcome: 'empty',
    relevance: {
      relevantIds: [
        // These would be relevant by content, but are forbidden by governance
        'capsule_smoke_api',
        'capsule_smoke_security',
        'capsule_smoke_testing',
      ],
      idealOrder: [],
    },
    governance: {
      forbiddenIds: [
        'capsule_smoke_api', // cross-team (artifact_smoke_other_team)
        'capsule_smoke_security', // security-level (requires 8, actor has 5)
        'capsule_smoke_testing', // lifecycle (pending, not approved)
      ],
      forbiddenReasons: ['cross-team', 'security-level', 'lifecycle'],
    },
    shape: {
      expectedProfileHintArtifactIds: [],
      expectedCapsuleCount: 0,
    },
  },
  tags: ['forbidden', 'v2', 'smoke', 'capsule', 'governance', 'governance-sensitive'],
}) as RetrievalEvalCase;

// =============================================================================
// Aggregated v2 Smoke Cases Export
// =============================================================================

/**
 * All v2 smoke-tier retrieval eval cases.
 */
export const v2RetrievalSmokeCases: RetrievalEvalCase[] = [
  v2CapsulePositiveSmoke,
  v2CapsuleEmptySmoke,
  v2CapsuleForbiddenSmoke,
];
