/**
 * Smoke-Tier Retrieval Evaluation Scenarios
 *
 * Provides deterministic fixture state and actor context for minimal smoke coverage.
 * These scenarios encode corpus state and actor context that can be referenced by
 * multiple eval cases across v1 and v2 endpoints.
 *
 * Coverage:
 * - Positive visible hit (approved, same team, security level satisfied)
 * - Empty result (no matching or relevant entries)
 * - Forbidden result (cross-team, security-level, or lifecycle filtering)
 *
 * Phase 25-02: REVAL-02
 */

import {
  retrievalEvalScenarioSchema,
  type RetrievalEvalScenario,
} from '../../../../packages/contracts/src/index.js';

// =============================================================================
// Smoke Scenario: Positive Visible Hit
// =============================================================================

/**
 * Scenario: Actor with standard permissions searches for approved team knowledge.
 * Expectation: One approved, visible entry in correct bucket or capsule.
 */
export const smokePositiveVisibleScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-positive-visible',
  description:
    'Actor with standard permissions searches for approved team knowledge. One approved, visible entry should appear.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_smoke_approved',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['docker', 'deployment'],
        shortcut: 'Docker Compose Setup',
        detail: 'Use docker-compose for multi-container setups. Simplifies deployment with compose files.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_smoke_approved',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['docker', 'containerization'],
        title: 'Docker Skills',
        slug: 'docker-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_docker',
            content: 'Use docker-compose for multi-container setups',
            situation: 'Deploying multiple containers',
            problem: 'Manual networking is error-prone',
            goal: 'Simplify deployment with compose',
            labels: ['docker', 'compose'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Smoke Scenario: Empty Result
// =============================================================================

/**
 * Scenario: Actor searches but no entries match or are visible.
 * Expectation: Empty result set returned.
 */
export const smokeEmptyResultScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-empty-result',
  description:
    'Actor searches for knowledge but no entries match the query. Empty result set should be returned.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_smoke_unrelated',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['unrelated', 'topic'],
        shortcut: 'Unrelated Knowledge',
        detail: 'This knowledge entry is about an unrelated topic that does not match the search query.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_smoke_unrelated',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['unrelated', 'different'],
        title: 'Unrelated Skills',
        slug: 'unrelated-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_unrelated',
            content: 'This capsule is about an unrelated topic',
            situation: 'Unrelated situation',
            problem: 'Unrelated problem',
            goal: 'Unrelated goal',
            labels: ['unrelated'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Smoke Scenario: Forbidden Result (Governance Filtering)
// =============================================================================

/**
 * Scenario: Actor searches for knowledge that exists but is forbidden.
 * Forbidden reasons: cross-team, security-level, lifecycle.
 * Expectation: Forbidden entries do not appear in results.
 */
export const smokeForbiddenScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-forbidden',
  description:
    'Actor searches for knowledge that exists but is forbidden due to cross-team, security-level, or lifecycle restrictions. Forbidden entries must not appear in results.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      // Cross-team entry: belongs to different team
      {
        id: 'knowledge_smoke_other_team',
        teamId: 'team_other',
        scope: 'project',
        labels: ['api', 'rate-limiting'],
        shortcut: 'REST API Rate Limiting',
        detail: 'Implement rate limiting for REST APIs. Use token bucket algorithm for throttling.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      // High security level entry: requires level 8, actor has level 5
      {
        id: 'knowledge_smoke_high_level',
        teamId: null, // Global scope
        scope: 'global',
        labels: ['security', 'credentials'],
        shortcut: 'Credential Management',
        detail: 'Secure credential management for production environments. Requires elevated security clearance.',
        requiredLevel: 8,
        lifecycleState: 'approved',
      },
      // Pending lifecycle: not yet approved
      {
        id: 'knowledge_smoke_pending',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['testing', 'unit-tests'],
        shortcut: 'Unit Testing Best Practices',
        detail: 'Write comprehensive unit tests for your code. Use mocking for external dependencies.',
        requiredLevel: 3,
        lifecycleState: 'pending',
      },
    ],
    skillArtifacts: [
      // Cross-team artifact
      {
        id: 'artifact_smoke_other_team',
        teamId: 'team_other',
        scope: 'project',
        labels: ['api', 'backend'],
        title: 'API Skills',
        slug: 'api-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_api',
            content: 'Implement rate limiting for REST APIs',
            situation: 'Building public API endpoints',
            problem: 'API abuse and overload',
            goal: 'Protect API with rate limiting',
            labels: ['api', 'rate-limiting'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      // High security level artifact
      {
        id: 'artifact_smoke_high_level',
        teamId: null, // Global
        scope: 'global',
        labels: ['security', 'production'],
        title: 'Production Security Skills',
        slug: 'production-security-skills',
        requiredLevel: 8,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_security',
            content: 'Secure credential management for production',
            situation: 'Managing production credentials',
            problem: 'Credential leakage risk',
            goal: 'Secure credential storage',
            labels: ['security', 'credentials'],
            scope: 'global',
            requiredLevel: 8,
          },
        ],
      },
      // Pending lifecycle artifact
      {
        id: 'artifact_smoke_pending',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['testing', 'quality'],
        title: 'Testing Skills',
        slug: 'testing-skills',
        requiredLevel: 3,
        lifecycleState: 'pending',
        capsules: [
          {
            capsuleId: 'capsule_smoke_testing',
            content: 'Write comprehensive unit tests',
            situation: 'Developing new features',
            problem: 'Untested code leads to bugs',
            goal: 'High test coverage',
            labels: ['testing', 'unit-tests'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Aggregated Smoke Scenarios Export
// =============================================================================

/**
 * All smoke-tier scenarios indexed by scenarioId.
 */
export const smokeScenariosMap: Record<string, RetrievalEvalScenario> = {
  'smoke-positive-visible': smokePositiveVisibleScenario,
  'smoke-empty-result': smokeEmptyResultScenario,
  'smoke-forbidden': smokeForbiddenScenario,
};

/**
 * Array of all smoke-tier scenarios for iteration.
 */
export const smokeScenarios = Object.values(smokeScenariosMap);
