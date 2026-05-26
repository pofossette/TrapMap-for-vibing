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

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '@trapmap/contracts/evals';

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
// v2 Smoke: Capsule Ranked Smoke
// =============================================================================

/**
 * Case: Search for docker knowledge, verify capsule ranking at smoke level.
 * Same scenario as positive hit but verifies idealOrder for capsule IDs.
 */
export const v2CapsuleRankedSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-capsule-ranked-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker compose deployment',
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
  tags: ['ranked', 'v2', 'smoke', 'capsule', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Smoke: Include Summary
// =============================================================================

/**
 * Case: Search with includeSummary=true, expect non-empty result.
 * Verifies summary generation path at smoke level.
 */
export const v2IncludeSummarySmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-include-summary-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker compose multi-container setup',
    maxResults: 10,
    includeSummary: true,
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
  tags: ['summary', 'v2', 'smoke', 'capsule', 'general'],
}) as RetrievalEvalCase;

// =============================================================================
// Phase 2: Keyword-Dominant Smoke Cases
// =============================================================================

/**
 * Case: Keyword-dominant retrieval - exact error message matching.
 * Tests keyword channel with specific Python error text.
 */
export const v2KeywordDominantSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-keyword-dominant-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'ModuleNotFoundError No module named requests',
    maxResults: 10,
  },
  scenarioId: 'smoke-keyword-dominant',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_keyword_import'],
      idealOrder: ['capsule_smoke_keyword_import'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_smoke_keyword_python',
        'artifact_smoke_keyword_regex',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['keyword-dominant', 'v2', 'smoke', 'capsule', 'error-debugging', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Keyword-dominant retrieval - specific technical term matching.
 * Tests keyword channel with regex-specific terminology.
 */
export const v2KeywordRegexSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-keyword-regex-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'regex pattern for parsing timestamps from logs',
    maxResults: 10,
  },
  scenarioId: 'smoke-keyword-dominant',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_keyword_regex'],
      idealOrder: ['capsule_smoke_keyword_regex'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_smoke_keyword_python',
        'artifact_smoke_keyword_regex',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['keyword-dominant', 'v2', 'smoke', 'capsule', 'general', 'multi-recall'],
}) as RetrievalEvalCase;

// =============================================================================
// Phase 3: Semantic-Dominant Smoke Cases
// =============================================================================

/**
 * Case: Semantic-dominant retrieval - paraphrase query vs technical capsule.
 * Query uses informal "types going wrong" language; capsule uses "type checking" terminology.
 */
export const v2SemanticDominantSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-semantic-dominant-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'my code has a lot of types going wrong and I cannot run it',
    maxResults: 10,
  },
  scenarioId: 'smoke-semantic-dominant',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_semantic_typescript'],
      idealOrder: ['capsule_smoke_semantic_typescript'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_smoke_semantic_typescript',
        'artifact_smoke_semantic_python',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['semantic-dominant', 'v2', 'smoke', 'capsule', 'paraphrase', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Semantic-dominant retrieval - technical paraphrase.
 * Query uses "running services together" instead of "container orchestration".
 */
export const v2SemanticParaphraseSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-semantic-paraphrase-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'how to make services run together without problems',
    maxResults: 10,
  },
  scenarioId: 'smoke-semantic-dominant',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_semantic_python'],
      idealOrder: ['capsule_smoke_semantic_python'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_smoke_semantic_typescript',
        'artifact_smoke_semantic_python',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['semantic-dominant', 'v2', 'smoke', 'capsule', 'paraphrase', 'multi-recall'],
}) as RetrievalEvalCase;

// =============================================================================
// Phase 5: Graph-Assisted v2 Smoke Cases
// =============================================================================

/**
 * Case: Graph-assisted retrieval - direct vitest query retrieves co-occurring jest capsule.
 * Query for vitest should pull in jest capsule via graph co-occurs-with edge.
 */
export const v2GraphAssistedCoOccursSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-graph-assisted-co-occurs-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'vitest configuration',
    maxResults: 10,
  },
  scenarioId: 'smoke-graph-assisted-v2',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_graph_assisted_vitest', 'capsule_smoke_graph_assisted_jest'],
      idealOrder: ['capsule_smoke_graph_assisted_vitest', 'capsule_smoke_graph_assisted_jest'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_smoke_graph_assisted_a',
        'artifact_smoke_graph_assisted_b',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['graph-assisted', 'v2', 'smoke', 'capsule', 'co-occurs', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Graph-assisted retrieval - governance check with graph expansion.
 * Ensures graph-derived candidates respect governance boundaries.
 */
export const v2GraphAssistedGovernanceSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-graph-assisted-governance-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'vitest testing setup',
    maxResults: 10,
  },
  scenarioId: 'smoke-graph-assisted-v2',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_graph_assisted_vitest', 'capsule_smoke_graph_assisted_jest'],
      idealOrder: ['capsule_smoke_graph_assisted_vitest', 'capsule_smoke_graph_assisted_jest'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_smoke_graph_assisted_a',
        'artifact_smoke_graph_assisted_b',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['graph-assisted', 'v2', 'smoke', 'capsule', 'governance', 'multi-recall'],
}) as RetrievalEvalCase;

// =============================================================================
// Phase 7: Label Filter Smoke Cases
// =============================================================================

/**
 * Case: Search with label filter to verify only matching capsules are returned.
 * Query matches both nodejs and python capsules by content, but label filter
 * restricts to nodejs only. Regression guard for v2 label filtering.
 */
export const v2LabelFilterSmoke = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-label-filter-smoke',
  tier: 'smoke',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'backend REST API middleware',
    maxResults: 10,
    filters: { labels: ['nodejs'], scopes: [] },
  },
  scenarioId: 'smoke-label-filter',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_smoke_label_filter_node'],
      idealOrder: ['capsule_smoke_label_filter_node'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_smoke_label_filter_node'],
      expectedCapsuleCount: 1,
    },
  },
  tags: ['label-filter', 'v2', 'smoke', 'capsule', 'regression'],
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
  v2CapsuleRankedSmoke,
  v2IncludeSummarySmoke,
  v2KeywordDominantSmoke,
  v2KeywordRegexSmoke,
  v2SemanticDominantSmoke,
  v2SemanticParaphraseSmoke,
  v2GraphAssistedCoOccursSmoke,
  v2GraphAssistedGovernanceSmoke,
  v2LabelFilterSmoke,
];
