/**
 * v2 Retrieval Core Datasets
 *
 * Core-tier cases for capsule-first retrieval (`/v2/retrieval/search`).
 * Covers: ranked capsules, profile hints, and governance scenarios.
 *
 * Phase 25-02: REVAL-02
 */

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '@trapmap/contracts/evals';

// =============================================================================
// v2 Core: Capsule Ranked Hits
// =============================================================================

/**
 * Case: Search for docker knowledge, expect multiple ranked capsules.
 */
export const v2CapsuleRankedCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-capsule-ranked-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker deployment orchestration containers',
    maxResults: 10,
  },
  scenarioId: 'core-ranked-hits',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: [
        'capsule_core_docker_compose',
        'capsule_core_docker_swarm',
        'capsule_core_docker_run',
        'capsule_core_docker_net',
      ],
      idealOrder: [
        'capsule_core_docker_compose', // Deployment + orchestration match
        'capsule_core_docker_swarm', // Scaling/orchestration match
        'capsule_core_docker_run', // Container basics
        'capsule_core_docker_net', // Networking
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_core_docker_primary',
        'artifact_core_docker_basics',
        'artifact_core_docker_global',
      ],
      expectedCapsuleCount: 4,
    },
  },
  tags: ['ranked', 'v2', 'core', 'capsule', 'multi-hit', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Core: Profile Hints Verification
// =============================================================================

/**
 * Case: Search for TypeScript knowledge, verify profile hints for artifact IDs.
 */
export const v2ProfileHintsCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-profile-hints-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'TypeScript type-safe patterns',
    maxResults: 10,
  },
  scenarioId: 'core-profile-hints',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_ts_types', 'capsule_core_ts_patterns'],
      idealOrder: [
        'capsule_core_ts_types', // Basics match first
        'capsule_core_ts_patterns', // Advanced patterns
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_core_typescript_basics',
        'artifact_core_typescript_advanced',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['profile-hints', 'v2', 'core', 'capsule', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Core: Mixed Visibility Governance
// =============================================================================

/**
 * Case: Search for API knowledge with mixed allowed/forbidden capsules.
 * Only allowed capsules appear; forbidden must stay absent.
 */
export const v2GovernanceCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-governance-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'API REST GraphQL security',
    maxResults: 10,
  },
  scenarioId: 'core-mixed-visibility',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_api_rest'],
      idealOrder: ['capsule_core_api_rest'],
    },
    governance: {
      forbiddenIds: [
        'capsule_core_api_graphql', // cross-team
        'capsule_core_api_mtls', // security-level (8 vs 5)
      ],
      forbiddenReasons: ['cross-team', 'security-level'],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_core_api_allowed'],
      expectedCapsuleCount: 1,
    },
  },
  tags: ['governance', 'v2', 'core', 'capsule', 'mixed-visibility', 'governance-sensitive'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Core: Bucket-Shape Equivalent (Scope Distribution)
// =============================================================================

/**
 * Case: Search for deployment knowledge, verify scope distribution in capsules.
 * Capsules inherit scope from their artifacts.
 */
export const v2ScopeDistributionCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-scope-distribution-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'deployment CI/CD standards',
    maxResults: 10,
  },
  scenarioId: 'core-bucket-shape',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_deploy_global', 'capsule_core_deploy_project'],
      idealOrder: [
        'capsule_core_deploy_project', // CI/CD specific
        'capsule_core_deploy_global', // Standards general
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_core_global', 'artifact_core_project'],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['scope', 'v2', 'core', 'capsule', 'distribution', 'global-constraints'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Core: Multi-Capsule Ranking
// =============================================================================

/**
 * Case: Search for docker knowledge, verify multiple capsule ranking.
 * Tests that all 4 capsules from core-ranked-hits scenario are returned in ideal order.
 */
export const v2MultiCapsuleCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-multi-capsule-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker compose swarm networking',
    maxResults: 10,
  },
  scenarioId: 'core-ranked-hits',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: [
        'capsule_core_docker_compose',
        'capsule_core_docker_swarm',
        'capsule_core_docker_net',
        'capsule_core_docker_run',
      ],
      idealOrder: [
        'capsule_core_docker_compose',
        'capsule_core_docker_swarm',
        'capsule_core_docker_net',
        'capsule_core_docker_run',
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_core_docker_primary',
        'artifact_core_docker_basics',
        'artifact_core_docker_global',
      ],
      expectedCapsuleCount: 4,
    },
  },
  tags: ['ranked', 'v2', 'core', 'capsule', 'multi-hit', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Core: Label Filter
// =============================================================================

/**
 * Case: Search with label filter for react/hooks knowledge.
 * Only capsules from matching-label artifacts should appear.
 */
export const v2LabelFilterCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-label-filter-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'react hooks state management',
    maxResults: 10,
    filters: {
      labels: ['react'],
      scopes: [],
    },
  },
  scenarioId: 'core-label-filter',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_label_react'],
      idealOrder: ['capsule_core_label_react'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_core_label_react'],
      expectedCapsuleCount: 1,
    },
  },
  tags: ['label-filter', 'v2', 'core', 'capsule', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v2 Core: Empty with Summary
// =============================================================================

/**
 * Case: Search for non-existent topic with includeSummary=true.
 * Expect empty result set even with summary flag.
 */
export const v2EmptyWithSummaryCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-empty-with-summary-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'xyzzy123 nonexistent query plugh456',
    maxResults: 10,
    includeSummary: true,
  },
  scenarioId: 'core-empty-summary',
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
  tags: ['empty', 'v2', 'core', 'capsule', 'summary', 'boundary'],
}) as RetrievalEvalCase;

// =============================================================================
// Aggregated v2 Core Cases Export
// =============================================================================

/**
 * All v2 core-tier retrieval eval cases.
 */
export const v2RetrievalCoreCases: RetrievalEvalCase[] = [
  v2CapsuleRankedCore,
  v2ProfileHintsCore,
  v2GovernanceCore,
  v2ScopeDistributionCore,
  v2MultiCapsuleCore,
  v2LabelFilterCore,
  v2EmptyWithSummaryCore,
];
