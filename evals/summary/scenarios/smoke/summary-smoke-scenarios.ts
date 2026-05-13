/**
 * Smoke-Tier Summary Evaluation Scenarios
 *
 * Provides deterministic fixture state and actor context for minimal smoke coverage.
 * These scenarios encode corpus state and actor context that can be referenced by
 * multiple summary eval cases across v1 and v2 endpoints.
 *
 * Coverage:
 * - Grounded summary: Summary with claims that match retrieved context
 * - Hallucination detection: Summary contains claims not supported by context
 * - Forbidden claim detection: Summary contains forbidden claims that should be flagged
 *
 * Phase 27-01: SEVAL-01, SEVAL-02
 */

import { type RetrievalEvalScenario, retrievalEvalScenarioSchema } from '@trapmap/contracts/evals';

// =============================================================================
// Smoke Scenario: Grounded Summary
// =============================================================================

/**
 * Scenario: Actor retrieves docker knowledge and summary contains grounded claims.
 * Expectation: Summary claims are supported by retrieved context, required facts covered.
 */
export const summarySmokeGroundedScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-smoke-grounded',
  description:
    'Actor retrieves docker knowledge. Summary with grounded claims that match retrieved context.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_summary_docker',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['docker', 'containerization'],
        title: 'Docker Compose Skills',
        slug: 'docker-compose-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_summary_docker_compose',
            content:
              'Use docker-compose for multi-container setups. Simplifies deployment with compose files.',
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
// Smoke Scenario: Hallucination Detection
// =============================================================================

/**
 * Scenario: Actor retrieves docker knowledge but summary may contain hallucinated facts.
 * Expectation: Judge detects claims not supported by retrieved context.
 */
export const summarySmokeHallucinationScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-smoke-hallucination',
  description:
    'Actor retrieves docker knowledge. Summary may contain hallucinated claims not in context.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_summary_orchestration',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['docker', 'orchestration'],
        title: 'Container Orchestration',
        slug: 'container-orchestration',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_summary_orchestration',
            content: 'Container orchestration best practices for development environments.',
            situation: 'Managing multiple services',
            problem: 'Service coordination complexity',
            goal: 'Simplify orchestration',
            labels: ['docker', 'orchestration'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Smoke Scenario: Forbidden Claim Detection
// =============================================================================

/**
 * Scenario: Actor retrieves API security knowledge with sensitive info patterns.
 * Expectation: Judge detects forbidden claims like passwords, secrets, tokens.
 */
export const summarySmokeForbiddenClaimScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-smoke-forbidden',
  description:
    'Actor retrieves API security knowledge. Summary should not expose sensitive patterns.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_summary_api_security',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['api', 'security', 'rate-limiting'],
        title: 'API Security Configuration',
        slug: 'api-security-config',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_summary_rate_limiting',
            content:
              'Implement rate limiting for REST APIs. Use token bucket algorithm for throttling requests.',
            situation: 'Building public API endpoints',
            problem: 'API abuse and overload',
            goal: 'Protect API with rate limiting',
            labels: ['api', 'rate-limiting', 'security'],
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
 * All smoke-tier summary scenarios indexed by scenarioId.
 */
// =============================================================================
// Smoke Scenario: Multi-Fact Coverage
// =============================================================================

/**
 * Scenario: Actor retrieves frontend knowledge with multiple distinct facts.
 * Expectation: Summary covers multiple required facts from context.
 */
export const summarySmokeMultiFactScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-smoke-multi-fact',
  description:
    'Actor retrieves frontend React knowledge. Summary should cover multiple distinct facts.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_summary_react_hooks',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['react', 'hooks', 'frontend'],
        title: 'React Hooks Skills',
        slug: 'react-hooks-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_summary_react_hooks',
            content:
              'Use useState for local component state. Use useEffect for side effects with cleanup. Use useCallback to memoize event handlers. Custom hooks extract reusable logic.',
            situation: 'Building React functional components',
            problem: 'State management and side effects in functional components',
            goal: 'Use hooks for clean React patterns',
            labels: ['react', 'hooks'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

export const summarySmokeScenariosMap: Record<string, RetrievalEvalScenario> = {
  'summary-smoke-grounded': summarySmokeGroundedScenario,
  'summary-smoke-hallucination': summarySmokeHallucinationScenario,
  'summary-smoke-forbidden': summarySmokeForbiddenClaimScenario,
  'summary-smoke-multi-fact': summarySmokeMultiFactScenario,
};

/**
 * Array of all smoke-tier summary scenarios for iteration.
 */
export const summarySmokeScenarios = Object.values(summarySmokeScenariosMap);
