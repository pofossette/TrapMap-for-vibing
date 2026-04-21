/**
 * v1 Retrieval Core Datasets
 *
 * Core-tier cases for legacy bucketed retrieval (`/v1/retrieval/search`).
 * Covers: semantic ranked, hybrid, graph-assisted, and bucket shape scenarios.
 *
 * Phase 25-02: REVAL-02
 */

import {
  retrievalEvalCaseSchema,
  type RetrievalEvalCase,
} from '../../../../packages/contracts/src/index.js';

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
        projectKnowledge: [
          'knowledge_core_docker_primary',
          'knowledge_core_docker_secondary',
        ],
        globalConstraints: ['knowledge_core_docker_networking'],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['ranked', 'v1', 'core', 'semantic', 'multi-hit'],
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
      relevantIds: [
        'knowledge_core_docker_primary',
        'knowledge_core_docker_secondary',
      ],
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
        projectKnowledge: [
          'knowledge_core_docker_primary',
          'knowledge_core_docker_secondary',
        ],
        globalConstraints: [],
      },
      expectedProfileHintArtifactIds: [],
    },
  },
  tags: ['ranked', 'v1', 'core', 'hybrid'],
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
      relevantIds: [
        'knowledge_core_docker_networking',
        'knowledge_core_docker_primary',
      ],
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
  tags: ['ranked', 'v1', 'core', 'graph-assisted'],
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
      relevantIds: [
        'knowledge_core_global_constraint',
        'knowledge_core_project_knowledge',
      ],
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
  tags: ['bucket-shape', 'v1', 'core', 'semantic', 'governance'],
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
  tags: ['governance', 'v1', 'core', 'semantic', 'mixed-visibility'],
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
];
