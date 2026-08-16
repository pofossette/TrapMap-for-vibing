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

import { type RetrievalEvalScenario, retrievalEvalScenarioSchema } from '../../../types/index.js';

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
        detail:
          'Deploy multiple containers with docker-compose. Use docker-compose.yml for orchestration. Configure networking and volumes.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_docker_secondary',
        teamId: 'team_core',
        scope: 'project',
        labels: ['docker', 'containers', 'basics'],
        shortcut: 'Docker Container Basics',
        detail:
          'Basic Docker container commands. Run, stop, and manage containers. Understand images and layers.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_docker_networking',
        teamId: null, // Global
        scope: 'global',
        labels: ['docker', 'networking', 'advanced'],
        shortcut: 'Docker Networking Guide',
        detail:
          'Advanced Docker networking concepts. Bridge, overlay, and host networks. Service discovery patterns.',
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
        detail:
          'Design RESTful APIs with proper resource naming. Use HTTP methods correctly. Version your APIs.',
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
        detail:
          'Organization-wide deployment standards. Use blue-green deployments. Follow change management process.',
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

export const coreGraphPlanSelectedScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-plan-selected',
  description:
    'Graph-plan selected path with one blocker trap and two mitigating skills for ranking coverage.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_graph_selected',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['docker', 'deployment', 'rollback'],
        shortcut: 'Docker rollout blocker',
        detail: 'Docker rollout blocker that requires a trap-first execution plan.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_graph_selected_primary',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['docker', 'deployment', 'compose'],
        title: 'Primary rollout skill',
        slug: 'primary-rollout-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_graph_selected_primary',
            content: 'Primary docker rollout mitigation',
            situation: 'Deploying docker services',
            problem: 'Rollout blocker needs direct mitigation',
            goal: 'Stabilize docker rollout',
            labels: ['docker', 'deployment'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_graph_selected_secondary',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['docker', 'rollback', 'safety'],
        title: 'Secondary rollback skill',
        slug: 'secondary-rollback-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_graph_selected_secondary',
            content: 'Secondary rollback guardrail',
            situation: 'Need rollback safety after mitigation',
            problem: 'Rollbacks drift without guardrails',
            goal: 'Add rollback safety checks',
            labels: ['rollback', 'safety'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_knowledge_core_graph_selected_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_graph_selected',
        revision: 1,
        contentHash: 'core-graph-plan-selected-trap',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_graph_selected',
            kind: 'trap',
            label: 'docker rollout blocker',
            evidence: 'core selected trap evidence',
          },
        ],
        edges: [
          {
            id: 'trap:knowledge_core_graph_selected->cue:rollout:risk-blocks',
            sourceNodeId: 'trap:knowledge_core_graph_selected',
            targetNodeId: 'cue:rollout',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'docker rollout blocker evidence',
          },
        ],
        evidence: 'derived from core graph-plan selected trap',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_artifact_core_graph_selected_primary_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_graph_selected_primary',
        revision: 1,
        contentHash: 'core-graph-plan-selected-primary',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_graph_selected_primary',
            kind: 'skill',
            label: 'primary rollout mitigation',
            evidence: 'primary mitigation evidence',
          },
        ],
        edges: [
          {
            id: 'skill:artifact_core_graph_selected_primary->trap:knowledge_core_graph_selected:mitigates',
            sourceNodeId: 'skill:artifact_core_graph_selected_primary',
            targetNodeId: 'trap:knowledge_core_graph_selected',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'primary skill mitigates rollout blocker',
          },
        ],
        evidence: 'derived from core graph-plan primary skill',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_artifact_core_graph_selected_secondary_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_graph_selected_secondary',
        revision: 1,
        contentHash: 'core-graph-plan-selected-secondary',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_graph_selected_secondary',
            kind: 'skill',
            label: 'secondary rollback guardrail',
            evidence: 'secondary guardrail evidence',
          },
        ],
        edges: [
          {
            id: 'skill:artifact_core_graph_selected_secondary->trap:knowledge_core_graph_selected:mitigates',
            sourceNodeId: 'skill:artifact_core_graph_selected_secondary',
            targetNodeId: 'trap:knowledge_core_graph_selected',
            relationType: 'mitigates',
            strength: 'soft',
            evidence: 'secondary skill also mitigates blocker',
          },
          {
            id: 'skill:artifact_core_graph_selected_primary->skill:artifact_core_graph_selected_secondary:requires',
            sourceNodeId: 'skill:artifact_core_graph_selected_primary',
            targetNodeId: 'skill:artifact_core_graph_selected_secondary',
            relationType: 'requires',
            strength: 'soft',
            evidence: 'secondary guardrail follows the primary mitigation',
          },
        ],
        evidence: 'derived from core graph-plan secondary skill',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

export const coreGraphPlanGovernanceScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-plan-governance',
  description:
    'Graph-plan governance path with one allowed skill and forbidden cross-team/high-security skills present in graph documents.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_graph_governed_allowed',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['api', 'governance', 'rollout'],
        shortcut: 'Governed rollout blocker',
        detail: 'Allowed trap entry for governance-aware rollout planning.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_graph_governed_allowed',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['api', 'governance', 'rollout'],
        title: 'Governed rollout skill',
        slug: 'governed-rollout-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_graph_governed_allowed',
            content: 'Allowed governed rollout skill',
            situation: 'Executing API rollout with team governance',
            problem: 'Need approved rollout guidance',
            goal: 'Apply governed rollout checks',
            labels: ['api', 'governance'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_graph_governed_other_team',
        teamId: 'team_other_core_graph',
        scope: 'project',
        labels: ['api', 'governance', 'rollout'],
        title: 'Other-team rollout skill',
        slug: 'other-team-rollout-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_graph_governed_other_team',
            content: 'Forbidden cross-team rollout skill',
            situation: 'Cross-team rollout knowledge',
            problem: 'Should stay filtered',
            goal: 'Never leak cross-team skill',
            labels: ['api', 'governance'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_graph_governed_high_level',
        teamId: null,
        scope: 'global',
        labels: ['api', 'governance', 'security'],
        title: 'High-level rollout skill',
        slug: 'high-level-rollout-skill',
        requiredLevel: 8,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_graph_governed_high_level',
            content: 'Forbidden high-security rollout skill',
            situation: 'High security rollout procedure',
            problem: 'Should stay filtered by level',
            goal: 'Never leak high-level skill',
            labels: ['api', 'security'],
            scope: 'global',
            requiredLevel: 8,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_knowledge_core_graph_governed_allowed_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_graph_governed_allowed',
        revision: 1,
        contentHash: 'core-graph-plan-governed-trap',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_graph_governed_allowed',
            kind: 'trap',
            label: 'governed rollout blocker',
            evidence: 'governed trap evidence',
          },
        ],
        edges: [
          {
            id: 'trap:knowledge_core_graph_governed_allowed->cue:governance:risk-blocks',
            sourceNodeId: 'trap:knowledge_core_graph_governed_allowed',
            targetNodeId: 'cue:governance',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'governance blocker evidence',
          },
        ],
        evidence: 'derived from governed core trap',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_artifact_core_graph_governed_allowed_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_graph_governed_allowed',
        revision: 1,
        contentHash: 'core-graph-plan-governed-allowed',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_graph_governed_allowed',
            kind: 'skill',
            label: 'governed rollout skill',
            evidence: 'allowed governed skill evidence',
          },
        ],
        edges: [
          {
            id: 'skill:artifact_core_graph_governed_allowed->trap:knowledge_core_graph_governed_allowed:mitigates',
            sourceNodeId: 'skill:artifact_core_graph_governed_allowed',
            targetNodeId: 'trap:knowledge_core_graph_governed_allowed',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'allowed governed skill mitigates the blocker',
          },
        ],
        evidence: 'derived from governed allowed skill',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_artifact_core_graph_governed_other_team_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_graph_governed_other_team',
        revision: 1,
        contentHash: 'core-graph-plan-governed-other-team',
        teamId: 'team_other_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_graph_governed_other_team',
            kind: 'skill',
            label: 'other-team governed rollout skill',
            evidence: 'cross-team evidence',
          },
        ],
        edges: [
          {
            id: 'skill:artifact_core_graph_governed_other_team->trap:knowledge_core_graph_governed_allowed:mitigates',
            sourceNodeId: 'skill:artifact_core_graph_governed_other_team',
            targetNodeId: 'trap:knowledge_core_graph_governed_allowed',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'cross-team skill would mitigate if it were allowed',
          },
        ],
        evidence: 'derived from forbidden cross-team skill',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_artifact_core_graph_governed_high_level_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_graph_governed_high_level',
        revision: 1,
        contentHash: 'core-graph-plan-governed-high-level',
        teamId: null,
        scope: 'global',
        requiredLevel: 8,
        nodes: [
          {
            id: 'skill:artifact_core_graph_governed_high_level',
            kind: 'skill',
            label: 'high-level governed rollout skill',
            evidence: 'high security evidence',
          },
        ],
        edges: [
          {
            id: 'skill:artifact_core_graph_governed_high_level->trap:knowledge_core_graph_governed_allowed:mitigates',
            sourceNodeId: 'skill:artifact_core_graph_governed_high_level',
            targetNodeId: 'trap:knowledge_core_graph_governed_allowed',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'high-level skill would mitigate if it were allowed',
          },
        ],
        evidence: 'derived from forbidden high-level skill',
        createdAt: '2026-04-25T00:00:00.000Z',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Graph-Plan Multi-Skill Orchestration
// =============================================================================

/**
 * Scenario: Multi-skill orchestration with order dependencies.
 * Two skills connected by 'order' edge, both mitigating same trap.
 * Tests: order edge, multiple mitigates edges, multi-skill focus.
 */
export const coreGraphPlanOrchestrationScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-plan-orchestration',
  description:
    'Multi-skill orchestration with order dependencies. First skill sets up infrastructure, second skill deploys application. Both mitigate deployment blocker.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_orchestration_trap',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['deployment', 'infrastructure', 'ordering'],
        shortcut: 'Deployment ordering blocker',
        detail: 'Deployment fails when application deployed before infrastructure is ready.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_orchestration_infra',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['infrastructure', 'setup'],
        title: 'Infrastructure Setup Skill',
        slug: 'infrastructure-setup-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_orchestration_infra',
            content: 'Set up infrastructure before deployment',
            situation: 'Preparing for application deployment',
            problem: 'Missing infrastructure blocks deployment',
            goal: 'Provision required infrastructure',
            labels: ['infrastructure', 'setup'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_orchestration_deploy',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['deployment', 'application'],
        title: 'Application Deployment Skill',
        slug: 'application-deployment-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_orchestration_deploy',
            content: 'Deploy application after infrastructure ready',
            situation: 'Infrastructure provisioned',
            problem: 'Need to deploy application correctly',
            goal: 'Successful application deployment',
            labels: ['deployment', 'application'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_core_orchestration_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_orchestration_trap',
        revision: 1,
        contentHash: 'core-orchestration-trap',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_orchestration_trap',
            kind: 'trap',
            label: 'deployment ordering blocker',
            evidence: 'application deployed before infrastructure',
          },
        ],
        edges: [],
        evidence: 'derived from orchestration trap',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_orchestration_infra_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_orchestration_infra',
        revision: 1,
        contentHash: 'core-orchestration-infra-skill',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_orchestration_infra',
            kind: 'skill',
            label: 'infrastructure setup skill',
            evidence: 'provision infrastructure first',
          },
        ],
        edges: [
          {
            id: 'skill:infra->trap:orchestration:mitigates',
            sourceNodeId: 'skill:artifact_core_orchestration_infra',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'infrastructure setup mitigates ordering blocker',
          },
        ],
        evidence: 'derived from infra skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_orchestration_deploy_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_orchestration_deploy',
        revision: 1,
        contentHash: 'core-orchestration-deploy-skill',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_orchestration_deploy',
            kind: 'skill',
            label: 'application deployment skill',
            evidence: 'deploy after infra ready',
          },
        ],
        edges: [
          {
            id: 'skill:deploy->trap:orchestration:mitigates',
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'trap:knowledge_core_orchestration_trap',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'deployment skill mitigates ordering blocker',
          },
          {
            id: 'skill:deploy->skill:infra:order',
            sourceNodeId: 'skill:artifact_core_orchestration_deploy',
            targetNodeId: 'skill:artifact_core_orchestration_infra',
            relationType: 'order',
            strength: 'soft',
            evidence: 'deploy must come after infra setup',
          },
        ],
        evidence: 'derived from deploy skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Label Filter
// =============================================================================

/**
 * Scenario: Actor searches with label filter.
 * Entries exist with different labels; only matching labels should appear.
 */
export const coreLabelFilterScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-label-filter',
  description:
    'Actor searches with label filter. Entries exist with different labels. Only entries matching the label filter should appear.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_label_react',
        teamId: 'team_core',
        scope: 'project',
        labels: ['react', 'hooks', 'frontend'],
        shortcut: 'React Hooks Guide',
        detail:
          'Use React hooks for state management. useState for local state, useEffect for side effects.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_label_node',
        teamId: 'team_core',
        scope: 'project',
        labels: ['nodejs', 'backend', 'express'],
        shortcut: 'Node.js Express Setup',
        detail: 'Set up Express.js server with middleware. Configure routing and error handling.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_label_db',
        teamId: 'team_core',
        scope: 'project',
        labels: ['database', 'postgres', 'backend'],
        shortcut: 'PostgreSQL Best Practices',
        detail:
          'Use connection pooling for PostgreSQL. Create indexes for frequently queried columns.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_label_react',
        teamId: 'team_core',
        scope: 'project',
        labels: ['react', 'hooks'],
        title: 'React Hooks Skills',
        slug: 'react-hooks-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_label_react',
            content: 'Use React hooks for state and effects',
            situation: 'Building React components',
            problem: 'Class components are verbose',
            goal: 'Simplify with hooks',
            labels: ['react', 'hooks'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_label_node',
        teamId: 'team_core',
        scope: 'project',
        labels: ['nodejs', 'express'],
        title: 'Node.js Express Skills',
        slug: 'nodejs-express-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_label_node',
            content: 'Build REST APIs with Express.js',
            situation: 'Creating backend services',
            problem: 'Need structured API layer',
            goal: 'Set up Express server',
            labels: ['nodejs', 'express'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Empty with Summary (v2)
// =============================================================================

/**
 * Scenario: Actor searches for a topic with no matching entries.
 * v2 endpoint with includeSummary=true should still return empty.
 */
export const coreEmptySummaryScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-empty-summary',
  description:
    'Actor searches for non-existent topic with includeSummary=true. No fixtures exist. Should return empty with no summary.',
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
// Core Scenario: Graph-Plan Multi-Trap Blocking
// =============================================================================

/**
 * Scenario: Two independent traps block different cues, each mitigated by a separate skill.
 * Tests multi-trap detection and per-trap mitigation routing.
 */
export const coreGraphPlanMultiTrapScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-plan-multi-trap',
  description:
    'Two independent traps block different cues. Each trap has a dedicated mitigating skill. Tests multi-trap blocking detection.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_multi_trap_memory',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['memory', 'leak', 'frontend'],
        shortcut: 'Memory leak trap',
        detail: 'Event listener memory leak that causes browser slowdown over time.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
      {
        id: 'knowledge_core_multi_trap_css',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['css', 'z-index', 'frontend'],
        shortcut: 'CSS z-index stacking trap',
        detail: 'z-index stacking context issues causing UI elements to be hidden.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_multi_trap_cleanup',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['memory', 'cleanup', 'frontend'],
        title: 'Event Listener Cleanup Skill',
        slug: 'event-listener-cleanup',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_multi_trap_cleanup',
            content: 'Clean up event listeners in useEffect return function',
            situation: 'Adding event listeners in React components',
            problem: 'Listeners persist after unmount causing memory leaks',
            goal: 'Properly clean up side effects',
            labels: ['memory', 'cleanup', 'react'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_multi_trap_zindex',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['css', 'z-index', 'frontend'],
        title: 'Z-Index Management Skill',
        slug: 'z-index-management',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_multi_trap_zindex',
            content: 'Use CSS custom properties for z-index management',
            situation: 'Managing overlapping UI elements',
            problem: 'Arbitrary z-index values cause stacking conflicts',
            goal: 'Systematic z-index layering',
            labels: ['css', 'z-index'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_core_multi_trap_memory_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_multi_trap_memory',
        revision: 1,
        contentHash: 'core-multi-trap-memory',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_multi_trap_memory',
            kind: 'trap',
            label: 'event listener memory leak',
            evidence: 'memory leak from uncleaned listeners',
          },
        ],
        edges: [
          {
            id: 'trap:memory->cue:memory:risk-blocks',
            sourceNodeId: 'trap:knowledge_core_multi_trap_memory',
            targetNodeId: 'cue:memory',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'memory leak blocks stable runtime',
          },
        ],
        evidence: 'derived from memory leak trap',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_trap_core_multi_trap_css_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_multi_trap_css',
        revision: 1,
        contentHash: 'core-multi-trap-css',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_multi_trap_css',
            kind: 'trap',
            label: 'z-index stacking trap',
            evidence: 'z-index stacking context conflict',
          },
        ],
        edges: [
          {
            id: 'trap:css->cue:layout:risk-blocks',
            sourceNodeId: 'trap:knowledge_core_multi_trap_css',
            targetNodeId: 'cue:layout',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'z-index conflict blocks correct layout',
          },
        ],
        evidence: 'derived from z-index trap',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_multi_trap_cleanup_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_multi_trap_cleanup',
        revision: 1,
        contentHash: 'core-multi-trap-cleanup',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_multi_trap_cleanup',
            kind: 'skill',
            label: 'event listener cleanup',
            evidence: 'cleanup skill evidence',
          },
        ],
        edges: [
          {
            id: 'skill:cleanup->trap:memory:mitigates',
            sourceNodeId: 'skill:artifact_core_multi_trap_cleanup',
            targetNodeId: 'trap:knowledge_core_multi_trap_memory',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'cleanup skill mitigates memory leak',
          },
        ],
        evidence: 'derived from cleanup skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_multi_trap_zindex_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_multi_trap_zindex',
        revision: 1,
        contentHash: 'core-multi-trap-zindex',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_multi_trap_zindex',
            kind: 'skill',
            label: 'z-index management',
            evidence: 'z-index skill evidence',
          },
        ],
        edges: [
          {
            id: 'skill:zindex->trap:css:mitigates',
            sourceNodeId: 'skill:artifact_core_multi_trap_zindex',
            targetNodeId: 'trap:knowledge_core_multi_trap_css',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'z-index skill mitigates stacking trap',
          },
        ],
        evidence: 'derived from z-index skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Graph-Plan Co-Occurs Edge
// =============================================================================

/**
 * Scenario: Two skills co-occur (frequently used together) and both mitigate the same trap.
 * Tests co-occurs-with edge type recognition.
 */
export const coreGraphPlanCoOccursScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-plan-co-occurs',
  description:
    'Two skills co-occur and both mitigate the same trap. Tests co-occurs-with edge recognition.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_co_occurs_trap',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['testing', 'flaky', 'ci'],
        shortcut: 'Flaky test trap',
        detail: 'Tests fail intermittently due to timing-dependent assertions.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_co_occurs_retry',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['testing', 'retry', 'ci'],
        title: 'Test Retry Strategy',
        slug: 'test-retry-strategy',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_co_occurs_retry',
            content: 'Add retry logic for flaky tests in CI pipeline',
            situation: 'Tests fail intermittently in CI',
            problem: 'Timing-dependent tests block deployments',
            goal: 'Stabilize CI with retries',
            labels: ['testing', 'retry'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_co_occurs_isolate',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['testing', 'isolation', 'ci'],
        title: 'Test Isolation Strategy',
        slug: 'test-isolation-strategy',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_co_occurs_isolate',
            content: 'Isolate test state with beforeEach/afterEach cleanup',
            situation: 'Tests share mutable state',
            problem: 'Shared state causes order-dependent failures',
            goal: 'Ensure test isolation',
            labels: ['testing', 'isolation'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_core_co_occurs_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_co_occurs_trap',
        revision: 1,
        contentHash: 'core-co-occurs-trap',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_co_occurs_trap',
            kind: 'trap',
            label: 'flaky test trap',
            evidence: 'timing-dependent test failures',
          },
        ],
        edges: [
          {
            id: 'trap:flaky->cue:ci:risk-blocks',
            sourceNodeId: 'trap:knowledge_core_co_occurs_trap',
            targetNodeId: 'cue:ci',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'flaky tests block CI pipeline',
          },
        ],
        evidence: 'derived from flaky test trap',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_co_occurs_retry_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_co_occurs_retry',
        revision: 1,
        contentHash: 'core-co-occurs-retry',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_co_occurs_retry',
            kind: 'skill',
            label: 'test retry strategy',
            evidence: 'retry skill evidence',
          },
        ],
        edges: [
          {
            id: 'skill:retry->trap:flaky:mitigates',
            sourceNodeId: 'skill:artifact_core_co_occurs_retry',
            targetNodeId: 'trap:knowledge_core_co_occurs_trap',
            relationType: 'mitigates',
            strength: 'soft',
            evidence: 'retry mitigates flaky test impact',
          },
        ],
        evidence: 'derived from retry skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_co_occurs_isolate_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_co_occurs_isolate',
        revision: 1,
        contentHash: 'core-co-occurs-isolate',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_co_occurs_isolate',
            kind: 'skill',
            label: 'test isolation strategy',
            evidence: 'isolation skill evidence',
          },
        ],
        edges: [
          {
            id: 'skill:isolate->trap:flaky:mitigates',
            sourceNodeId: 'skill:artifact_core_co_occurs_isolate',
            targetNodeId: 'trap:knowledge_core_co_occurs_trap',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'isolation directly addresses root cause',
          },
          {
            id: 'skill:isolate->skill:retry:co-occurs-with',
            sourceNodeId: 'skill:artifact_core_co_occurs_isolate',
            targetNodeId: 'skill:artifact_core_co_occurs_retry',
            relationType: 'co-occurs-with',
            strength: 'soft',
            evidence: 'isolation and retry frequently used together',
          },
        ],
        evidence: 'derived from isolation skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Core Scenario: Graph-Plan Requires Edge
// =============================================================================

/**
 * Scenario: Skill B requires Skill A (prerequisite dependency).
 * Tests requires edge type and dependency chain detection.
 */
export const coreGraphPlanRequiresScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-plan-requires',
  description:
    'Skill B requires Skill A as prerequisite. Tests requires edge type and dependency chain.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_requires_trap',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['kubernetes', 'oom', 'infrastructure'],
        shortcut: 'K8s OOM kill trap',
        detail: 'Containers get OOM killed due to missing resource limits.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_requires_limits',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['kubernetes', 'resources', 'infrastructure'],
        title: 'Resource Limits Skill',
        slug: 'resource-limits-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_requires_limits',
            content: 'Set memory and CPU limits in Kubernetes manifests',
            situation: 'Deploying to Kubernetes',
            problem: 'Containers consume unbounded resources',
            goal: 'Prevent OOM kills with limits',
            labels: ['kubernetes', 'resources'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_requires_monitoring',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['kubernetes', 'monitoring', 'infrastructure'],
        title: 'Resource Monitoring Skill',
        slug: 'resource-monitoring-skill',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_requires_monitoring',
            content: 'Set up Prometheus metrics for container resource usage',
            situation: 'Need visibility into resource consumption',
            problem: 'Cannot detect OOM risk before kill',
            goal: 'Monitor and alert on resource usage',
            labels: ['kubernetes', 'monitoring'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_trap_core_requires_r1',
        sourceType: 'trap',
        sourceId: 'knowledge_core_requires_trap',
        revision: 1,
        contentHash: 'core-requires-trap',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'trap:knowledge_core_requires_trap',
            kind: 'trap',
            label: 'K8s OOM kill trap',
            evidence: 'containers killed for exceeding memory',
          },
        ],
        edges: [
          {
            id: 'trap:oom->cue:stability:risk-blocks',
            sourceNodeId: 'trap:knowledge_core_requires_trap',
            targetNodeId: 'cue:stability',
            relationType: 'risk-blocks',
            strength: 'hard',
            evidence: 'OOM kills block production stability',
          },
        ],
        evidence: 'derived from OOM trap',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_requires_limits_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_requires_limits',
        revision: 1,
        contentHash: 'core-requires-limits',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_requires_limits',
            kind: 'skill',
            label: 'resource limits skill',
            evidence: 'set memory limits evidence',
          },
        ],
        edges: [
          {
            id: 'skill:limits->trap:oom:mitigates',
            sourceNodeId: 'skill:artifact_core_requires_limits',
            targetNodeId: 'trap:knowledge_core_requires_trap',
            relationType: 'mitigates',
            strength: 'hard',
            evidence: 'resource limits directly prevent OOM',
          },
        ],
        evidence: 'derived from limits skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_requires_monitoring_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_requires_monitoring',
        revision: 1,
        contentHash: 'core-requires-monitoring',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_requires_monitoring',
            kind: 'skill',
            label: 'resource monitoring skill',
            evidence: 'monitoring skill evidence',
          },
        ],
        edges: [
          {
            id: 'skill:monitoring->trap:oom:mitigates',
            sourceNodeId: 'skill:artifact_core_requires_monitoring',
            targetNodeId: 'trap:knowledge_core_requires_trap',
            relationType: 'mitigates',
            strength: 'soft',
            evidence: 'monitoring helps detect OOM risk early',
          },
          {
            id: 'skill:monitoring->skill:limits:requires',
            sourceNodeId: 'skill:artifact_core_requires_monitoring',
            targetNodeId: 'skill:artifact_core_requires_limits',
            relationType: 'requires',
            strength: 'hard',
            evidence: 'monitoring requires limits to be set first for meaningful thresholds',
          },
        ],
        evidence: 'derived from monitoring skill',
        createdAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-04T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Phase 0-3: Multi-Recall Scenarios
// =============================================================================

/**
 * Scenario: Keyword-dominant retrieval for v2 multi-recall testing.
 * Capsules contain specific error text, labels, and paths for exact keyword matching.
 * Semantic similarity should be lower for some capsules due to different wording.
 */
export const coreKeywordDominantScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-keyword-dominant',
  description:
    'Capsules with specific error text, labels, and file paths for exact keyword recall testing. Some capsules use very specific technical terms that keyword recall should catch.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_keyword_nginx',
        teamId: 'team_core',
        scope: 'project',
        labels: ['nginx', 'configuration', 'error'],
        shortcut: 'Nginx Configuration Error',
        detail:
          'Error: ENOENT: no such file or directory, open /etc/nginx/nginx.conf. Check nginx configuration file location.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_keyword_nginx',
        teamId: 'team_core',
        scope: 'project',
        labels: ['nginx', 'config', 'error'],
        title: 'Nginx Error Resolution Skills',
        slug: 'nginx-error-resolution',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_keyword_nginx_conf',
            content: 'Fix nginx configuration file location',
            situation: 'Nginx fails to start',
            problem: 'nginx.conf file not found at /etc/nginx/nginx.conf',
            goal: 'Create and configure nginx.conf correctly',
            labels: ['nginx', 'config', 'fix'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_keyword_pnpm',
        teamId: 'team_core',
        scope: 'project',
        labels: ['pnpm', 'lockfile', 'ci'],
        title: 'Pnpm Lockfile Skills',
        slug: 'pnpm-lockfile-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_keyword_pnpm_lockfile',
            content: 'Resolve pnpm lockfile mismatch errors',
            situation: 'CI pipeline failing',
            problem: 'pnpm-lock.yaml is out of sync with package.json',
            goal: 'Regenerate lockfile with frozen-lockfile flag',
            labels: ['pnpm', 'lockfile', 'ci-fix'],
            scope: 'project',
            requiredLevel: 3,
          },
          {
            capsuleId: 'capsule_core_keyword_pnpm_workspace',
            content: 'Manage pnpm workspace packages',
            situation: 'Setting up monorepo',
            problem: 'Workspace packages have version mismatches',
            goal: 'Use pnpm workspace protocol',
            labels: ['pnpm', 'workspace', 'monorepo'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

/**
 * Scenario: Semantic-paraphrase retrieval for v2 multi-recall testing.
 * Capsules use technical jargon; queries use plain English paraphrases.
 * Lexically different but semantically similar; tests semantic recall complement.
 */
export const coreSemanticParaphraseScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-semantic-paraphrase',
  description:
    'Capsules with technical jargon vs queries with plain English paraphrases. Tests semantic recall ability when lexical terms differ.',
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
        id: 'artifact_core_semantic_orchestration',
        teamId: 'team_core',
        scope: 'project',
        labels: ['deployment', 'containers', 'orchestration'],
        title: 'Container Orchestration Skills',
        slug: 'container-orchestration-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_semantic_orchestration',
            content: 'Orchestrate multi-service deployments with Kubernetes',
            situation: 'Managing distributed microservices',
            problem: 'Manual deployment coordination is fragile',
            goal: 'Automate service orchestration',
            labels: ['kubernetes', 'orchestration'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_semantic_observability',
        teamId: 'team_core',
        scope: 'project',
        labels: ['monitoring', 'logging', 'observability'],
        title: 'Observability Skills',
        slug: 'observability-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_semantic_observability',
            content: 'Implement distributed tracing and structured logging',
            situation: 'Cannot debug production issues',
            problem: 'No visibility into service interactions',
            goal: 'Debug production with tracing',
            labels: ['tracing', 'logging', 'debugging'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_semantic_cicd',
        teamId: 'team_core',
        scope: 'project',
        labels: ['cicd', 'automation', 'testing'],
        title: 'CI/CD Automation Skills',
        slug: 'cicd-automation-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_semantic_cicd',
            content: 'Build automated deployment pipelines',
            situation: 'Slow manual deployments',
            problem: 'Releases take too long',
            goal: 'Automate build and deploy process',
            labels: ['cicd', 'automation'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

/**
 * Scenario: Mixed-channel retrieval for v2 multi-recall testing.
 * Rich capsules that could be found by multiple channels (keyword, semantic, heuristic).
 * Some have exact term matches, some have semantic similarity, some have both.
 */
export const coreMixedChannelScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-mixed-channel',
  description:
    'Rich capsules that could be found by multiple recall channels. Tests merge/dedup behavior when same capsule is recalled from different channels.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [
      {
        id: 'knowledge_core_mixed_build_error',
        teamId: 'team_core',
        scope: 'project',
        labels: ['typescript', 'build', 'error'],
        shortcut: 'TypeScript Build Error Fix',
        detail: 'Fix TypeScript build errors: Module not found, type mismatch, strict null checks.',
        requiredLevel: 3,
        lifecycleState: 'approved',
      },
    ],
    skillArtifacts: [
      {
        id: 'artifact_core_mixed_typescript',
        teamId: 'team_core',
        scope: 'project',
        labels: ['typescript', 'build', 'errors'],
        title: 'TypeScript Error Skills',
        slug: 'typescript-error-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_mixed_ts_build',
            content: 'Fix TypeScript compilation errors in CI build',
            situation: 'Build pipeline failing',
            problem: 'TypeScript strict mode errors block deployment',
            goal: 'Resolve TS errors and pass build',
            labels: ['typescript', 'build', 'ci'],
            scope: 'project',
            requiredLevel: 3,
          },
          {
            capsuleId: 'capsule_core_mixed_ts_config',
            content: 'Configure tsconfig for optimal strict checking',
            situation: 'Setting up TypeScript project',
            problem: 'Need proper type checking configuration',
            goal: 'Enable strict mode incrementally',
            labels: ['typescript', 'config'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_mixed_ci',
        teamId: 'team_core',
        scope: 'project',
        labels: ['ci', 'github-actions', 'build'],
        title: 'CI Pipeline Skills',
        slug: 'ci-pipeline-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_mixed_ci_pipeline',
            content: 'Set up GitHub Actions CI for TypeScript projects',
            situation: 'Starting new project',
            problem: 'No automated build and test pipeline',
            goal: 'Automate CI with type checking and tests',
            labels: ['ci', 'github-actions', 'typescript'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Phase 5 Core Scenario: Graph-Assisted v2
// =============================================================================

/**
 * Scenario: Tool co-occurrence graph relationships for v2 graph-assisted recall.
 * Artifact A's skill references docker, artifact B's skill references kubernetes.
 * Graph documents show co-occurs-with edge between the docker and kubernetes tools.
 * Query for "docker" should expand via graph to also find the kubernetes capsule.
 */
export const coreGraphAssistedV2Scenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'core-graph-assisted-v2',
  description:
    'Skill artifacts with graph documents showing co-occurs-with relationship between docker and kubernetes tools.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_core_graph',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [
      {
        id: 'artifact_core_graph_assisted_docker',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['docker', 'container', 'deployment'],
        title: 'Docker Container Skills',
        slug: 'docker-container-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_graph_assisted_docker',
            content: 'Build efficient Docker images with multi-stage builds',
            situation: 'Creating container images for deployment',
            problem: 'Docker images are too large and slow to build',
            goal: 'Optimize Docker build with multi-stage patterns',
            labels: ['docker', 'container', 'optimization'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_core_graph_assisted_k8s',
        teamId: 'team_core_graph',
        scope: 'project',
        labels: ['kubernetes', 'orchestration', 'deployment'],
        title: 'Kubernetes Skills',
        slug: 'kubernetes-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_core_graph_assisted_k8s',
            content: 'Deploy Docker containers to Kubernetes with proper manifests',
            situation: 'Running containers in production',
            problem: 'Need to orchestrate container deployment at scale',
            goal: 'Set up Kubernetes deployment for Docker containers',
            labels: ['kubernetes', 'k8s', 'deployment'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_skill_core_graph_assisted_docker_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_graph_assisted_docker',
        revision: 1,
        contentHash: 'core-graph-assisted-v2-docker',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_graph_assisted_docker',
            kind: 'skill',
            label: 'docker',
            evidence: 'docker container skill',
          },
        ],
        edges: [
          {
            id: 'skill:docker->skill:k8s:co-occurs-with',
            sourceNodeId: 'skill:artifact_core_graph_assisted_docker',
            targetNodeId: 'skill:artifact_core_graph_assisted_k8s',
            relationType: 'co-occurs-with',
            strength: 'soft',
            evidence: 'docker and kubernetes often used together',
          },
        ],
        evidence: 'derived from core graph-assisted v2 docker skill',
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_core_graph_assisted_k8s_r1',
        sourceType: 'skill',
        sourceId: 'artifact_core_graph_assisted_k8s',
        revision: 1,
        contentHash: 'core-graph-assisted-v2-k8s',
        teamId: 'team_core_graph',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_core_graph_assisted_k8s',
            kind: 'skill',
            label: 'kubernetes',
            evidence: 'kubernetes orchestration skill',
          },
        ],
        edges: [],
        evidence: 'derived from core graph-assisted v2 k8s skill',
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:00.000Z',
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
  'core-graph-plan-selected': coreGraphPlanSelectedScenario,
  'core-graph-plan-governance': coreGraphPlanGovernanceScenario,
  'core-graph-plan-orchestration': coreGraphPlanOrchestrationScenario,
  'core-label-filter': coreLabelFilterScenario,
  'core-empty-summary': coreEmptySummaryScenario,
  'core-graph-plan-multi-trap': coreGraphPlanMultiTrapScenario,
  'core-graph-plan-co-occurs': coreGraphPlanCoOccursScenario,
  'core-graph-plan-requires': coreGraphPlanRequiresScenario,
  'core-keyword-dominant': coreKeywordDominantScenario,
  'core-semantic-paraphrase': coreSemanticParaphraseScenario,
  'core-mixed-channel': coreMixedChannelScenario,
  'core-graph-assisted-v2': coreGraphAssistedV2Scenario,
};

/**
 * Array of all core-tier scenarios for iteration.
 */
export const coreScenarios = Object.values(coreScenariosMap);
