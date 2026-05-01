/**
 * Core-Tier Summary Evaluation Scenarios
 *
 * Deterministic fixture state for core-tier summary coverage.
 * Covers: mixed groundedness, multi-fact coverage, governance boundary,
 * and empty-result edge cases.
 */

import { type RetrievalEvalScenario, retrievalEvalScenarioSchema } from '@trapmap/contracts';

// =============================================================================
// Core Scenario: Mixed Groundedness
// =============================================================================

export const summaryCoreMixedGroundedScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-core-mixed-grounded',
  description:
    'Actor retrieves TypeScript knowledge. Some claims should be grounded, others are edge cases.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_core_ts_types',
        teamId: 'team_core',
        scope: 'project',
        labels: ['typescript', 'types'],
        title: 'TypeScript Type Safety',
        slug: 'ts-type-safety',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_ts_types',
            content:
              'Use TypeScript strict mode for type safety. Enable noUncheckedIndexedAccess for array access. Prefer interfaces over type aliases for object shapes.',
            situation: 'Building type-safe applications',
            problem: 'Runtime type errors in production',
            goal: 'Catch type errors at compile time',
            labels: ['typescript', 'types', 'strict'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Multi-Fact Coverage
// =============================================================================

export const summaryCoreMultiFactScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-core-multi-fact',
  description: 'Actor retrieves CI/CD knowledge with multiple distinct facts to cover.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_core_cicd',
        teamId: 'team_core',
        scope: 'project',
        labels: ['ci-cd', 'pipeline'],
        title: 'CI/CD Pipeline Configuration',
        slug: 'cicd-pipeline',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_cicd_pipeline',
            content:
              'Use GitHub Actions for CI/CD. Run lint, typecheck, and test in parallel jobs. Deploy only after all checks pass. Use branch protection rules on main.',
            situation: 'Setting up automated deployment',
            problem: 'Manual deployment is error-prone',
            goal: 'Automate the release pipeline',
            labels: ['ci-cd', 'github-actions', 'deployment'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Governance Boundary
// =============================================================================

export const summaryCoreGovernanceScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-core-governance',
  description:
    'Actor retrieves security knowledge. Summary must not expose internal governance patterns.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_core_security',
        teamId: 'team_core',
        scope: 'project',
        labels: ['security', 'authentication'],
        title: 'Authentication Best Practices',
        slug: 'auth-best-practices',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_auth',
            content:
              'Use short-lived JWT tokens with refresh rotation. Store tokens in httpOnly cookies. Implement CSRF protection for state-changing requests.',
            situation: 'Securing web application endpoints',
            problem: 'Session hijacking and CSRF attacks',
            goal: 'Harden authentication flow',
            labels: ['security', 'jwt', 'csrf'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Empty Result
// =============================================================================

export const summaryCoreEmptyScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'summary-core-empty',
  description: 'Actor searches for non-existent topic. No capsules returned, no summary expected.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Aggregated Core Scenarios Export
// =============================================================================

export const summaryCoreScenariosMap: Record<string, RetrievalEvalScenario> = {
  'summary-core-mixed-grounded': summaryCoreMixedGroundedScenario,
  'summary-core-multi-fact': summaryCoreMultiFactScenario,
  'summary-core-governance': summaryCoreGovernanceScenario,
  'summary-core-empty': summaryCoreEmptyScenario,
};

export const summaryCoreScenarios = Object.values(summaryCoreScenariosMap);
