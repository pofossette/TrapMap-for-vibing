/**
 * v1 Retrieval Core Datasets
 *
 * Core-tier cases for legacy bucketed retrieval (`/v1/retrieval/search`).
 * Covers: semantic ranked, hybrid, graph-assisted, and bucket shape scenarios.
 *
 * Phase 25-02: REVAL-02
 */

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '@trapmap/contracts/evals';

// =============================================================================
// v1 Core: Semantic Ranked Hits
// =============================================================================

/**
 * Case: Search for docker knowledge with multiple relevant entries.
 * Expect ranked results with ideal order for metrics calculation.
 */
export const v1SemanticRankedCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-semantic-ranked-core',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'docker deployment orchestration',
    mode: 'semantic',
    maxResults: 10,
  },
  scenarioId: 'core-ranked-hits',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: [
        'knowledge_core_docker_primary',
        'knowledge_core_docker_secondary',
        'knowledge_core_docker_networking',
      ],
      idealOrder: [
        'knowledge_core_docker_primary', // Most specific match
        'knowledge_core_docker_secondary', // Second match
        'knowledge_core_docker_networking', // Global, networking focus
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: ['knowledge_core_docker_primary', 'knowledge_core_docker_secondary'],
        globalConstraints: ['knowledge_core_docker_networking'],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['ranked', 'v1', 'core', 'semantic', 'multi-hit', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Core: Hybrid Mode Ranked
// =============================================================================

/**
 * Case: Search using hybrid mode for docker knowledge.
 * Hybrid combines semantic and keyword search.
 */
export const v1HybridRankedCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-hybrid-ranked-core',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'docker compose containers',
    mode: 'hybrid',
    maxResults: 10,
  },
  scenarioId: 'core-ranked-hits',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_core_docker_primary', 'knowledge_core_docker_secondary'],
      idealOrder: [
        'knowledge_core_docker_primary', // Contains "compose" keyword
        'knowledge_core_docker_secondary', // Contains "containers" keyword
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: ['knowledge_core_docker_primary', 'knowledge_core_docker_secondary'],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['ranked', 'v1', 'core', 'hybrid', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Core: Graph-Assisted Mode
// =============================================================================

/**
 * Case: Search using graph-assisted mode.
 * Graph-assisted leverages relationship information for retrieval.
 */
export const v1GraphAssistedRankedCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-graph-assisted-ranked-core',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'docker networking services',
    mode: 'graph-assisted',
    maxResults: 10,
  },
  scenarioId: 'core-ranked-hits',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_core_docker_networking', 'knowledge_core_docker_primary'],
      idealOrder: [
        'knowledge_core_docker_networking', // Networking focus
        'knowledge_core_docker_primary', // Related through docker
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: ['knowledge_core_docker_primary'],
        globalConstraints: ['knowledge_core_docker_networking'],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['ranked', 'v1', 'core', 'graph-assisted', 'general'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Core: Bucket Shape Verification
// =============================================================================

/**
 * Case: Search for deployment knowledge, verify bucket split.
 * Expect global entries in globalConstraints, team entries in projectKnowledge.
 */
export const v1BucketShapeCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-bucket-shape-core',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'deployment standards CI/CD pipeline',
    mode: 'semantic',
    maxResults: 10,
  },
  scenarioId: 'core-bucket-shape',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_core_global_constraint', 'knowledge_core_project_knowledge'],
      idealOrder: [
        'knowledge_core_project_knowledge', // More specific to CI/CD
        'knowledge_core_global_constraint', // General standards
      ],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      bucketExpectations: {
        globalConstraints: ['knowledge_core_global_constraint'],
        projectKnowledge: ['knowledge_core_project_knowledge'],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['bucket-shape', 'v1', 'core', 'semantic', 'governance', 'global-constraints'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Core: Mixed Visibility Governance
// =============================================================================

/**
 * Case: Search for API knowledge with mixed allowed/forbidden entries.
 * Only allowed entries should appear; forbidden must stay absent.
 */
export const v1GovernanceCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-governance-core',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'API design security versioning',
    mode: 'semantic',
    maxResults: 10,
  },
  scenarioId: 'core-mixed-visibility',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_core_api_allowed'],
      idealOrder: ['knowledge_core_api_allowed'],
    },
    governance: {
      forbiddenIds: [
        'knowledge_core_api_other_team', // cross-team
        'knowledge_core_api_secure', // security-level (8 vs 5)
        'knowledge_core_api_draft', // lifecycle (pending)
      ],
      forbiddenReasons: ['cross-team', 'security-level', 'lifecycle'],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: ['knowledge_core_api_allowed'],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['governance', 'v1', 'core', 'semantic', 'mixed-visibility', 'governance-sensitive'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Core: Label Filter
// =============================================================================

/**
 * Case: Search with label filter for react/hooks knowledge.
 * Only entries matching the label filter should appear.
 */
export const v1LabelFilterCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-label-filter-core',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'react hooks state management',
    mode: 'semantic',
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
      relevantIds: ['knowledge_core_label_react'],
      idealOrder: ['knowledge_core_label_react'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: ['knowledge_core_label_react'],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['label-filter', 'v1', 'core', 'semantic', 'how-to'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Core: Low maxResults
// =============================================================================

/**
 * Case: Search for docker knowledge with maxResults=1.
 * Only the top-ranked result should be returned.
 */
export const v1LowMaxResultsCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-low-maxresults-core',
  tier: 'core',
  endpoint: '/v1/retrieval/search',
  request: {
    seed: 'docker deployment orchestration',
    mode: 'semantic',
    maxResults: 1,
  },
  scenarioId: 'core-ranked-hits',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['knowledge_core_docker_primary'],
      idealOrder: ['knowledge_core_docker_primary'],
    },
    governance: {
      forbiddenIds: [],
      forbiddenReasons: [],
    },
    shape: {
      bucketExpectations: {
        projectKnowledge: ['knowledge_core_docker_primary'],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['ranked', 'v1', 'core', 'semantic', 'low-maxresults'],
}) as RetrievalEvalCase;

// =============================================================================
// v1 Core: Skill Lookup Governance
// =============================================================================

/**
 * Case: Search artifact content via skill lookup with mixed visibility.
 * Only governed artifacts should appear in the artifact-first response.
 */
export const v1SkillLookupGovernanceCore = retrievalEvalCaseSchema.parse({
  schemaVersion: 1,
  caseId: 'v1-skill-lookup-governance-core',
  tier: 'core',
  endpoint: '/v1/retrieval/skills/search-by-content',
  request: {
    seed: 'API REST GraphQL security',
    maxResults: 10,
  },
  scenarioId: 'core-mixed-visibility',
  expected: {
    outcome: 'non-empty',
    relevance: {
      relevantIds: ['artifact_core_api_allowed'],
      idealOrder: ['artifact_core_api_allowed'],
    },
    governance: {
      forbiddenIds: ['artifact_core_api_other', 'artifact_core_api_secure'],
      forbiddenReasons: ['cross-team', 'security-level'],
    },
    shape: {
      expectedArtifactIds: ['artifact_core_api_allowed'],
    },
  },
  tags: ['governance', 'v1', 'core', 'skill-lookup', 'capsule', 'governance-sensitive'],
}) as RetrievalEvalCase;

// =============================================================================
// Aggregated v1 Core Cases Export
// =============================================================================

/**
 * All v1 core-tier retrieval eval cases.
 */
export const v1RetrievalCoreCases: RetrievalEvalCase[] = [
  v1SemanticRankedCore,
  v1HybridRankedCore,
  v1GraphAssistedRankedCore,
  v1BucketShapeCore,
  v1GovernanceCore,
  v1LabelFilterCore,
  v1LowMaxResultsCore,
  v1SkillLookupGovernanceCore,
];
