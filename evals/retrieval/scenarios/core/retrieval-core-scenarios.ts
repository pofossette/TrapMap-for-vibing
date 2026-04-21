/**
 * Core-Tier Retrieval Evaluation Scenarios
 *
 * Provides richer fixture state and actor context for ranking and governance coverage.
 * These scenarios support multiple-hit, mixed-visibility, and mode-variation testing.
 *
 * Coverage:
 * - Multiple relevant hits with ideal ranking order
 * - Mixed allowed/forbidden candidates for governance leakage detection
 * - Mode variations (semantic, hybrid, graph-assisted)
 * - Bucket shape verification (globalConstraints vs projectKnowledge)
 * - Profile hints and capsule ranking expectations
 *
 * Phase 25-02: REVAL-02
 */

import {
  retrievalEvalScenarioSchema,
  type RetrievalEvalScenario,
} from '../../../../packages/contracts/src/index.js';

// =============================================================================
// Core Scenario: Multiple Relevant Hits with Ranking
// =============================================================================

/**
 * Scenario: Actor searches for Docker-related knowledge.
 * Multiple approved entries exist with different relevance levels.
 * Expectation: Results ranked by relevance score, ideal order preserved.
 */
export const coreRankedHitsScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-ranked-hits',
  description:
    'Actor searches for Docker deployment knowledge. Multiple approved entries exist with varying relevance. Results should be ranked with ideal order preserved.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_docker_primary',
        teamId: 'team_core',
        scope: 'project',
        labels: ['docker', 'deployment', 'compose'],
        shortcut: 'Docker Compose Multi-Container',
        detail: 'Deploy multiple containers with docker-compose. Use docker-compose.yml for orchestration. Configure networking and volumes.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_docker_secondary',
        teamId: 'team_core',
        scope: 'project',
        labels: ['docker', 'containers', 'basics'],
        shortcut: 'Docker Container Basics',
        detail: 'Basic Docker container commands. Run, stop, and manage containers. Understand images and layers.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_docker_networking',
        teamId: null, // Global
        scope: 'global',
        labels: ['docker', 'networking', 'advanced'],
        shortcut: 'Docker Networking Guide',
        detail: 'Advanced Docker networking concepts. Bridge, overlay, and host networks. Service discovery patterns.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_docker_primary',
        teamId: 'team_core',
        scope: 'project',
        labels: ['docker', 'deployment'],
        title: 'Docker Deployment Skills',
        slug: 'docker-deployment-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_docker_compose',
            content: 'Deploy multi-container applications with docker-compose',
            situation: 'Deploying microservices stack',
            problem: 'Manual container orchestration is complex',
            goal: 'Simplify deployment with compose',
            labels: ['docker', 'compose'],
            scope: 'project',
            requiredLevel: 3,
          },
          {
            capsuleId: 'capsule_core_docker_swarm',
            content: 'Scale containers with Docker Swarm mode',
            situation: 'Need container orchestration at scale',
            problem: 'Single-host Docker has limitations',
            goal: 'Use Swarm for distributed containers',
            labels: ['docker', 'swarm', 'scaling'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_docker_basics',
        teamId: 'team_core',
        scope: 'project',
        labels: ['docker', 'containers'],
        title: 'Docker Basics Skills',
        slug: 'docker-basics-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_docker_run',
            content: 'Run and manage Docker containers',
            situation: 'Starting with Docker',
            problem: 'Need to run containerized applications',
            goal: 'Execute and manage containers',
            labels: ['docker', 'basics'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_docker_global',
        teamId: null, // Global
        scope: 'global',
        labels: ['docker', 'networking'],
        title: 'Docker Networking Skills',
        slug: 'docker-networking-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_docker_net',
            content: 'Configure Docker networking for services',
            situation: 'Connecting multiple containers',
            problem: 'Containers cannot communicate',
            goal: 'Set up container networking',
            labels: ['docker', 'networking'],
            scope: 'global',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Mixed Visibility (Allowed + Forbidden)
// =============================================================================

/**
 * Scenario: Actor searches for API knowledge.
 * Mix of approved and forbidden entries exist.
 * Forbidden reasons: cross-team, security-level, lifecycle.
 * Expectation: Only allowed entries appear; forbidden entries stay absent.
 */
export const coreMixedVisibilityScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-mixed-visibility',
  description:
    'Actor searches for API knowledge. Mix of approved and forbidden entries exist. Only allowed entries should appear; forbidden entries must stay absent even if content matches.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      // Allowed: approved, same team
      {
        id: 'knowledge_core_api_allowed',
        teamId: 'team_core',
        scope: 'project',
        labels: ['api', 'rest', 'design'],
        shortcut: 'REST API Design Guide',
        detail: 'Design RESTful APIs with proper resource naming. Use HTTP methods correctly. Version your APIs.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      // Forbidden: cross-team
      {
        id: 'knowledge_core_api_other_team',
        teamId: 'team_other_core',
        scope: 'project',
        labels: ['api', 'graphql'],
        shortcut: 'GraphQL API Patterns',
        detail: 'Implement GraphQL APIs for flexible data fetching. Use queries and mutations.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      // Forbidden: high security level
      {
        id: 'knowledge_core_api_secure',
        teamId: null, // Global
        scope: 'global',
        labels: ['api', 'security', 'internal'],
        shortcut: 'Internal API Security',
        detail: 'Secure internal APIs with mutual TLS. Configure certificate authentication.',
        requiredLevel: 8,
        lifecycleState: 'approved',
      },
      // Forbidden: pending lifecycle
      {
        id: 'knowledge_core_api_draft',
        teamId: 'team_core',
        scope: 'project',
        labels: ['api', 'versioning'],
        shortcut: 'API Versioning Strategy',
        detail: 'Version APIs using URL paths. Handle breaking changes gracefully.',
        requiredLevel: 3,
        lifecycleState: 'pending',
      },
    ],
    skillArtifacts: [
      // Allowed artifact
      {
        id: 'artifact_core_api_allowed',
        teamId: 'team_core',
        scope: 'project',
        labels: ['api', 'rest'],
        title: 'REST API Skills',
        slug: 'rest-api-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_api_rest',
            content: 'Design RESTful APIs with proper conventions',
            situation: 'Building web services',
            problem: 'Inconsistent API design',
            goal: 'Create clean REST APIs',
            labels: ['api', 'rest'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      // Forbidden: cross-team artifact
      {
        id: 'artifact_core_api_other',
        teamId: 'team_other_core',
        scope: 'project',
        labels: ['api', 'graphql'],
        title: 'GraphQL Skills',
        slug: 'graphql-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_api_graphql',
            content: 'Build flexible APIs with GraphQL',
            situation: 'Need flexible data fetching',
            problem: 'REST over/under-fetching',
            goal: 'Use GraphQL for flexibility',
            labels: ['api', 'graphql'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      // Forbidden: high security artifact
      {
        id: 'artifact_core_api_secure',
        teamId: null, // Global
        scope: 'global',
        labels: ['api', 'security'],
        title: 'Internal API Security Skills',
        slug: 'internal-api-security-skills',
        requiredLevel: 8,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_api_mtls',
            content: 'Secure internal APIs with mTLS',
            situation: 'Service-to-service communication',
            problem: 'API authentication needed',
            goal: 'Implement mTLS for APIs',
            labels: ['api', 'security'],
            scope: 'global',
            requiredLevel: 8,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Bucket Shape Verification
// =============================================================================

/**
 * Scenario: Actor searches for knowledge across both scopes.
 * Entries exist in both global and project scopes.
 * Expectation: Results split correctly into globalConstraints and projectKnowledge buckets.
 */
export const coreBucketShapeScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-bucket-shape',
  description:
    'Actor searches for deployment knowledge. Entries exist in both global and project scopes. Results should split correctly into globalConstraints and projectKnowledge buckets.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_global_constraint',
        teamId: null, // Global
        scope: 'global',
        labels: ['deployment', 'standards'],
        shortcut: 'Global Deployment Standards',
        detail: 'Organization-wide deployment standards. Use blue-green deployments. Follow change management process.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_project_knowledge',
        teamId: 'team_core',
        scope: 'project',
        labels: ['deployment', 'ci-cd'],
        shortcut: 'Project CI/CD Pipeline',
        detail: 'Project-specific CI/CD pipeline configuration. Use GitHub Actions for automation.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_global',
        teamId: null, // Global
        scope: 'global',
        labels: ['deployment', 'standards'],
        title: 'Deployment Standards Skills',
        slug: 'deployment-standards-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_deploy_global',
            content: 'Follow organization deployment standards',
            situation: 'Deploying to production',
            problem: 'Inconsistent deployments',
            goal: 'Standardize deployment process',
            labels: ['deployment', 'standards'],
            scope: 'global',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_project',
        teamId: 'team_core',
        scope: 'project',
        labels: ['deployment', 'ci-cd'],
        title: 'CI/CD Pipeline Skills',
        slug: 'cicd-pipeline-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_deploy_project',
            content: 'Configure project CI/CD pipeline',
            situation: 'Automating deployments',
            problem: 'Manual deployment errors',
            goal: 'Automate with CI/CD',
            labels: ['deployment', 'ci-cd'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Profile Hints Verification
// =============================================================================

/**
 * Scenario: Actor searches for TypeScript knowledge.
 * Multiple skill artifacts match with profile hints.
 * Expectation: Profile hints provided for matched artifact IDs.
 */
export const coreProfileHintsScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-profile-hints',
  description:
    'Actor searches for TypeScript knowledge. Multiple skill artifacts match with profile hints. Profile hints should be provided for matched artifact IDs.',
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
        id: 'artifact_core_typescript_basics',
        teamId: 'team_core',
        scope: 'project',
        labels: ['typescript', 'basics'],
        title: 'TypeScript Fundamentals',
        slug: 'typescript-fundamentals',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_ts_types',
            content: 'Use TypeScript for type-safe JavaScript',
            situation: 'Building type-safe applications',
            problem: 'JavaScript runtime errors',
            goal: 'Catch errors at compile time',
            labels: ['typescript', 'types'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_typescript_advanced',
        teamId: 'team_core',
        scope: 'project',
        labels: ['typescript', 'advanced'],
        title: 'Advanced TypeScript Patterns',
        slug: 'advanced-typescript-patterns',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_ts_patterns',
            content: 'Apply advanced TypeScript patterns',
            situation: 'Complex type requirements',
            problem: 'Simple types insufficient',
            goal: 'Use advanced type features',
            labels: ['typescript', 'patterns'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Aggregated Core Scenarios Export
// =============================================================================

/**
 * All core-tier scenarios indexed by scenarioId.
 */
export const coreScenariosMap: Record<string, RetrievalEvalScenario> = {
  'core-ranked-hits': coreRankedHitsScenario,
  'core-mixed-visibility': coreMixedVisibilityScenario,
  'core-bucket-shape': coreBucketShapeScenario,
  'core-profile-hints': coreProfileHintsScenario,
};

/**
 * Array of all core-tier scenarios for iteration.
 */
export const coreScenarios = Object.values(coreScenariosMap);
