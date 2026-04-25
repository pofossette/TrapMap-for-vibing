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

export const smokeGraphPlanSelectedScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-graph-plan-selected',
  description:
    'Graph-plan selected path with one approved trap, one approved skill, and matching graph documents.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_smoke_graph_selected',
        teamId: 'team_smoke_graph',
        scope: 'project',
        labels: ['docker', 'compose', 'deployment'],
        shortcut: 'Docker compose rollout blocker',
        detail: 'Docker compose rollout blocker that appears during deployment drift.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_smoke_graph_selected',
        teamId: 'team_smoke_graph',
        scope: 'project',
        labels: ['docker', 'compose', 'deployment'],
        title: 'Docker compose rollout skill',
        slug: 'docker-compose-rollout-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_graph_selected',
            content: 'Use docker compose rollout checks before deployment',
            situation: 'Deploying compose workloads',
            problem: 'Deployment drift blocks rollout',
            goal: 'Stabilize compose deployment',
            labels: ['docker', 'compose', 'deployment'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_knowledge_smoke_graph_selected_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_smoke_graph_selected',
        revision: 1,
        contentHash: 'smoke-graph-plan-selected-trap',
        teamId: 'team_smoke_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_smoke_graph_selected',
            kind: 'trap',
            label: 'compose rollout blocker',
            evidence: 'deployment drift evidence',
          },
        ],
        edges: [
          {
            id: 'trap:knowledge_smoke_graph_selected->cue:compose:risk-blocks',
            sourceNodeId: 'trap:knowledge_smoke_graph_selected',
            targetNodeId: 'cue:compose',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'compose risk blocks rollout',
          },
        ],
        evidence: 'derived from smoke graph-plan selected trap',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_artifact_smoke_graph_selected_r1',
        sourceType: 'skill',
        sourceId: 'artifact_smoke_graph_selected',
        revision: 1,
        contentHash: 'smoke-graph-plan-selected-skill',
        teamId: 'team_smoke_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_smoke_graph_selected',
            kind: 'skill',
            label: 'compose rollout skill',
            evidence: 'approved compose rollout guidance',
          },
        ],
        edges: [
          {
            id: 'skill:artifact_smoke_graph_selected->trap:knowledge_smoke_graph_selected:mitigates',
            sourceNodeId: 'skill:artifact_smoke_graph_selected',
            targetNodeId: 'trap:knowledge_smoke_graph_selected',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'compose rollout skill mitigates blocker',
          },
        ],
        evidence: 'derived from smoke graph-plan selected skill',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

export const smokeGraphPlanFallbackV2Scenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-graph-plan-fallback-v2',
  description:
    'Graph-plan low trap evidence path with only a governed skill artifact and graph skill document.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_smoke_graph_fallback_v2',
        teamId: 'team_smoke_graph',
        scope: 'project',
        labels: ['fallback', 'capsule', 'deployment'],
        title: 'Capsule fallback deployment skill',
        slug: 'capsule-fallback-deployment-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_graph_fallback_v2',
            content: 'Fallback capsule for deployment guidance',
            situation: 'Need deployment capsule fallback',
            problem: 'Graph plan has no blocker evidence',
            goal: 'Return governed capsule guidance',
            labels: ['fallback', 'deployment'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_skill_artifact_smoke_graph_fallback_v2_r1',
        sourceType: 'skill',
        sourceId: 'artifact_smoke_graph_fallback_v2',
        revision: 1,
        contentHash: 'smoke-graph-plan-fallback-v2-skill',
        teamId: 'team_smoke_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_smoke_graph_fallback_v2',
            kind: 'skill',
            label: 'fallback capsule skill',
            evidence: 'capsule fallback evidence',
          },
        ],
        edges: [],
        evidence: 'derived from smoke fallback v2 skill',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

export const smokeGraphPlanFallbackV1Scenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-graph-plan-fallback-v1',
  description:
    'Graph-plan insufficient skill evidence path with only a governed trap entry and graph trap document.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_smoke_graph_fallback_v1',
        teamId: 'team_smoke_graph',
        scope: 'project',
        labels: ['trap', 'rollback', 'blocker'],
        shortcut: 'Rollback blocker trap',
        detail: 'Rollback blocker trap that should fall back to v1 graph-assisted retrieval.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_knowledge_smoke_graph_fallback_v1_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_smoke_graph_fallback_v1',
        revision: 1,
        contentHash: 'smoke-graph-plan-fallback-v1-trap',
        teamId: 'team_smoke_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_smoke_graph_fallback_v1',
            kind: 'trap',
            label: 'rollback blocker',
            evidence: 'rollback blocker evidence',
          },
        ],
        edges: [
          {
            id: 'trap:knowledge_smoke_graph_fallback_v1->cue:rollback:risk-blocks',
            sourceNodeId: 'trap:knowledge_smoke_graph_fallback_v1',
            targetNodeId: 'cue:rollback',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'rollback trap blocks progress',
          },
        ],
        evidence: 'derived from smoke fallback v1 trap',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
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
  'smoke-graph-plan-selected': smokeGraphPlanSelectedScenario,
  'smoke-graph-plan-fallback-v2': smokeGraphPlanFallbackV2Scenario,
  'smoke-graph-plan-fallback-v1': smokeGraphPlanFallbackV1Scenario,
};

/**
 * Array of all smoke-tier scenarios for iteration.
 */
export const smokeScenarios = Object.values(smokeScenariosMap);
