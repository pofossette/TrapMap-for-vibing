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
// Phase 0-3: Multi-Recall v2 Core Cases
// =============================================================================

/**
 * Case: Keyword-dominant retrieval - error text and exact label matching.
 * Tests keyword recall with specific error messages and technical labels.
 */
export const v2KeywordDominantCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-keyword-dominant-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'pnpm workspace lockfile mismatch frozen-lockfile pnpm-lock.yaml',
    maxResults: 10,
  },
  scenarioId: 'core-keyword-dominant',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_keyword_pnpm_lockfile', 'capsule_core_keyword_pnpm_workspace'],
      idealOrder: ['capsule_core_keyword_pnpm_lockfile', 'capsule_core_keyword_pnpm_workspace'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_core_keyword_pnpm'],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['keyword-dominant', 'v2', 'core', 'capsule', 'error-debugging', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Keyword-dominant retrieval - exact error message matching.
 * Tests keyword recall with specific file path and error text.
 */
export const v2KeywordErrorTextCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-keyword-error-text-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'ENOENT no such file or directory /etc/nginx/nginx.conf',
    maxResults: 10,
  },
  scenarioId: 'core-keyword-dominant',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_keyword_nginx_conf'],
      idealOrder: ['capsule_core_keyword_nginx_conf'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_core_keyword_nginx'],
      expectedCapsuleCount: 1,
    },
  },
  tags: ['keyword-dominant', 'v2', 'core', 'capsule', 'error-debugging', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Semantic-paraphrase retrieval - different words, same concept.
 * Tests that semantic recall can find capsules despite lexical differences.
 */
export const v2SemanticParaphraseCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-semantic-paraphrase-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'running multiple services together in a coordinated way automatically',
    maxResults: 10,
  },
  scenarioId: 'core-semantic-paraphrase',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_semantic_orchestration', 'capsule_core_semantic_cicd'],
      idealOrder: ['capsule_core_semantic_orchestration', 'capsule_core_semantic_cicd'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_core_semantic_orchestration'],
      expectedCapsuleCount: 1,
    },
  },
  tags: ['semantic-dominant', 'v2', 'core', 'capsule', 'general', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Semantic-paraphrase retrieval - plain English for technical concept.
 * Tests semantic recall for observability concept with non-technical query.
 */
export const v2SemanticDebugCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-semantic-debug-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'how to figure out why my services are broken in production',
    maxResults: 10,
  },
  scenarioId: 'core-semantic-paraphrase',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_semantic_observability'],
      idealOrder: ['capsule_core_semantic_observability'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_core_semantic_orchestration',
        'artifact_core_semantic_observability',
        'artifact_core_semantic_cicd',
      ],
      expectedCapsuleCount: 3,
    },
  },
  tags: ['semantic-dominant', 'v2', 'core', 'capsule', 'error-debugging', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Mixed-channel retrieval - keyword + semantic reach same capsule.
 * Tests merge/dedup when both keyword (exact terms) and semantic (concept) match.
 */
export const v2MixedChannelCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-mixed-channel-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'TypeScript build errors in CI pipeline during compilation',
    maxResults: 10,
  },
  scenarioId: 'core-mixed-channel',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: [
        'capsule_core_mixed_ts_build',
        'capsule_core_mixed_ci_pipeline',
        'capsule_core_mixed_ts_config',
      ],
      idealOrder: [
        'capsule_core_mixed_ts_build',
        'capsule_core_mixed_ci_pipeline',
        'capsule_core_mixed_ts_config',
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: ['artifact_core_mixed_typescript', 'artifact_core_mixed_ci'],
      expectedCapsuleCount: 3,
    },
  },
  tags: ['mixed-channel', 'v2', 'core', 'capsule', 'error-debugging', 'multi-recall'],
}) as RetrievalEvalCase;

// =============================================================================
// Phase 5: Graph-Assisted v2 Core Cases
// =============================================================================

/**
 * Case: Graph-assisted retrieval - docker query expands to kubernetes capsule.
 * Tests co-occurs-with edge expansion in the v2 graph channel.
 */
export const v2GraphAssistedCoOccursCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-graph-assisted-co-occurs-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'docker container deployment',
    maxResults: 10,
  },
  scenarioId: 'core-graph-assisted-v2',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_graph_assisted_docker', 'capsule_core_graph_assisted_k8s'],
      idealOrder: ['capsule_core_graph_assisted_docker', 'capsule_core_graph_assisted_k8s'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_core_graph_assisted_docker',
        'artifact_core_graph_assisted_k8s',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['graph-assisted', 'v2', 'core', 'capsule', 'co-occurs', 'multi-recall'],
}) as RetrievalEvalCase;

/**
 * Case: Graph-assisted retrieval - kubernetes query finds docker via reverse graph expansion.
 * Tests that the graph channel can use entity matching in either direction.
 */
export const v2GraphAssistedReverseCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v2-graph-assisted-reverse-core',
  tier: 'core',
  endpoint: '/v2/retrieval/search',
  request: {
    seed: 'kubernetes orchestration',
    maxResults: 10,
  },
  scenarioId: 'core-graph-assisted-v2',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['capsule_core_graph_assisted_k8s', 'capsule_core_graph_assisted_docker'],
      idealOrder: ['capsule_core_graph_assisted_k8s', 'capsule_core_graph_assisted_docker'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      expectedProfileHintArtifactIds: [
        'artifact_core_graph_assisted_docker',
        'artifact_core_graph_assisted_k8s',
      ],
      expectedCapsuleCount: 2,
    },
  },
  tags: ['graph-assisted', 'v2', 'core', 'capsule', 'co-occurs', 'multi-recall'],
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
  v2KeywordDominantCore,
  v2KeywordErrorTextCore,
  v2SemanticParaphraseCore,
  v2SemanticDebugCore,
  v2MixedChannelCore,
  v2GraphAssistedCoOccursCore,
  v2GraphAssistedReverseCore,
];
