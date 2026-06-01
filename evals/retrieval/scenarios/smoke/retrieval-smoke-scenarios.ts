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

import { type RetrievalEvalScenario, retrievalEvalScenarioSchema } from '@trapmap/contracts/evals';

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
        detail:
          'Use docker-compose for multi-container setups. Simplifies deployment with compose files.',
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
 * Scenario: Actor searches but no entries exist in the system.
 * Expectation: Empty result set returned.
 * Note: This scenario has NO fixtures to ensure truly empty results.
 */
export const smokeEmptyResultScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-empty-result',
  description:
    'Actor searches for knowledge but no entries exist. Empty result set should be returned.',
  actor: {
    subjectType: 'user',
    activeTeamId: 'team_smoke',
    securityLevel: 5,
    permissions: ['knowledge:search'],
  },
  fixtures: {
    knowledgeEntries: [],
    skillArtifacts: [],
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
        detail:
          'Secure credential management for production environments. Requires elevated security clearance.',
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
        detail:
          'Write comprehensive unit tests for your code. Use mocking for external dependencies.',
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
// Smoke Scenario: Keyword-Dominant (Phase 2 multi-recall)
// =============================================================================

/**
 * Scenario: Keyword-dominant retrieval with error text and specific technical labels.
 * Capsules contain distinct error messages and tech labels for exact keyword recall.
 */
export const smokeKeywordDominantScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-keyword-dominant',
  description:
    'Capsules with specific error text, file paths, and technical labels for keyword-only recall.',
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
        id: 'artifact_smoke_keyword_python',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['python', 'import', 'error'],
        title: 'Python Import Error Skills',
        slug: 'python-import-error',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_keyword_import',
            content: 'Fix Python module import errors',
            situation: 'Running Python scripts',
            problem: 'ModuleNotFoundError: No module named requests',
            goal: 'Install missing Python packages',
            labels: ['python', 'import', 'pip'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_smoke_keyword_regex',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['regex', 'pattern', 'parsing'],
        title: 'Regex Parsing Skills',
        slug: 'regex-parsing',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_keyword_regex',
            content: 'Use regex for text pattern matching',
            situation: 'Parsing log files',
            problem: 'Need to extract timestamps with regex pattern',
            goal: 'Write regex to parse log timestamps',
            labels: ['regex', 'parsing', 'logs'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Phase 3 Smoke Scenario: Semantic-Dominant
// =============================================================================

/**
 * Scenario: Capsules with technical terminology that requires semantic recall
 * when queries use informal or paraphrased language.
 * TypeScript capsule uses "type checking errors" — query uses "types going wrong".
 * Python capsule uses "inter-service communication" — query uses "services running together".
 */
export const smokeSemanticDominantScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-semantic-dominant',
  description:
    'Capsules with technical terminology for semantic-only recall via paraphrased/informal queries.',
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
        id: 'artifact_smoke_semantic_typescript',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['typescript', 'types', 'errors'],
        title: 'TypeScript Error Skills',
        slug: 'typescript-errors',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_semantic_typescript',
            content: 'Resolve TypeScript type checking errors by configuring tsconfig properly',
            situation: 'Working on a TypeScript codebase',
            problem: 'TypeScript type checking errors prevent compilation and running code',
            goal: 'Fix all type errors so the project compiles and runs successfully',
            labels: ['typescript', 'types', 'compilation'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_smoke_semantic_python',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['python', 'services', 'orchestration'],
        title: 'Python Service Orchestration',
        slug: 'python-service-orchestration',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_semantic_python',
            content: 'Orchestrate multiple Python microservices using docker compose',
            situation: 'Running several Python services that need to communicate',
            problem: 'Inter-service communication failures and port conflicts',
            goal: 'Coordinate services to run together reliably without conflicts',
            labels: ['python', 'orchestration', 'docker'],
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
// Phase 5 Smoke Scenario: Graph-Assisted v2
// =============================================================================

/**
 * Scenario: Skill artifact capsules with graph index documents for test tool co-occurrence.
 * One skill uses vitest (direct hit), another uses jest (graph-expanded via vitest co-occurrence).
 * Query for "vitest" should retrieve both capsules via graph expansion.
 */
export const smokeGraphAssistedV2Scenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-graph-assisted-v2',
  description:
    'Skill artifacts with graph documents showing co-occurs-with relationship between vitest and jest tools.',
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
        id: 'artifact_smoke_graph_assisted_a',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['vitest', 'testing'],
        title: 'Vitest Testing Skills',
        slug: 'vitest-testing-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_graph_assisted_vitest',
            content: 'Configure vitest for component testing with proper coverage',
            situation: 'Setting up testing in a Vite project',
            problem: 'vitest configuration errors prevent tests from running',
            goal: 'Correctly configure vitest for reliable test execution',
            labels: ['vitest', 'testing', 'coverage'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_smoke_graph_assisted_b',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['jest', 'testing'],
        title: 'Jest Testing Skills',
        slug: 'jest-testing-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_graph_assisted_jest',
            content: 'Use jest for unit testing with snapshot coverage',
            situation: 'Writing unit tests for a React application',
            problem: 'jest snapshot tests are flaky and need stabilization',
            goal: 'Create reliable jest snapshots for component testing',
            labels: ['jest', 'snapshot', 'react'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [
      {
        id: 'graphdoc_skill_artifact_smoke_graph_assisted_a_r1',
        sourceType: 'skill',
        sourceId: 'artifact_smoke_graph_assisted_a',
        revision: 1,
        contentHash: 'smoke-graph-assisted-v2-skill-a',
        teamId: 'team_smoke',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_smoke_graph_assisted_a',
            kind: 'skill',
            label: 'vitest',
            evidence: 'vitest testing skill',
          },
        ],
        edges: [
          {
            id: 'skill:artifact_smoke_graph_assisted_a->skill:artifact_smoke_graph_assisted_b:co-occurs-with',
            sourceNodeId: 'skill:artifact_smoke_graph_assisted_a',
            targetNodeId: 'skill:artifact_smoke_graph_assisted_b',
            relationType: 'co-occurs-with',
            strength: 'soft',
            evidence: 'vitest and jest both used for testing',
          },
        ],
        evidence: 'derived from smoke graph-assisted v2 skill A',
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:00.000Z',
      },
      {
        id: 'graphdoc_skill_artifact_smoke_graph_assisted_b_r1',
        sourceType: 'skill',
        sourceId: 'artifact_smoke_graph_assisted_b',
        revision: 1,
        contentHash: 'smoke-graph-assisted-v2-skill-b',
        teamId: 'team_smoke',
        scope: 'project',
        requiredLevel: 3,
        nodes: [
          {
            id: 'skill:artifact_smoke_graph_assisted_b',
            kind: 'skill',
            label: 'jest',
            evidence: 'jest testing skill',
          },
        ],
        edges: [],
        evidence: 'derived from smoke graph-assisted v2 skill B',
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:00.000Z',
      },
    ],
  },
}) as RetrievalEvalScenario;

/**
 * Scenario: Same v2 capsule pair as graph-assisted smoke, but without graph documents.
 * Serves as the vector/semantic baseline so mixed recall can be compared against
 * the graph-linked variant without changing the artifact content.
 */
export const smokeGraphAssistedV2NoGraphScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-graph-assisted-v2-no-graph',
  description:
    'Skill artifacts identical to the graph-assisted smoke case but with no graph documents, providing a vector-only baseline.',
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
        id: 'artifact_smoke_graph_assisted_a',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['vitest', 'testing'],
        title: 'Vitest Testing Skills',
        slug: 'vitest-testing-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_graph_assisted_vitest',
            content: 'Configure vitest for component testing with proper coverage',
            situation: 'Setting up testing in a Vite project',
            problem: 'vitest configuration errors prevent tests from running',
            goal: 'Correctly configure vitest for reliable test execution',
            labels: ['vitest', 'testing', 'coverage'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_smoke_graph_assisted_b',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['jest', 'testing'],
        title: 'Jest Testing Skills',
        slug: 'jest-testing-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_graph_assisted_jest',
            content: 'Use jest for unit testing with snapshot coverage',
            situation: 'Writing unit tests for a React application',
            problem: 'jest snapshot tests are flaky and need stabilization',
            goal: 'Create reliable jest snapshots for component testing',
            labels: ['jest', 'snapshot', 'react'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
    ],
    graphIndexDocuments: [],
  },
}) as RetrievalEvalScenario;

// =============================================================================
// Phase 7 Smoke Scenario: Label Filter
// =============================================================================

/**
 * Scenario: Two artifacts with distinct labels (nodejs, python) for label-filter regression.
 * Nodejs artifact has an Express.js middleware capsule; python artifact has a Flask capsule.
 * Filtering by `labels: ['nodejs']` must return only the nodejs capsule.
 */
export const smokeLabelFilterScenario = retrievalEvalScenarioSchema.parse({
  scenarioId: 'smoke-label-filter',
  description:
    'Two artifacts with distinct labels (nodejs vs python). Label filter must exclude the unlabelled artifact.',
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
        id: 'artifact_smoke_label_filter_node',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['nodejs', 'backend', 'api'],
        title: 'Node.js Backend Skills',
        slug: 'nodejs-backend-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_label_filter_node',
            content:
              'Use Express.js middleware for request validation, logging, and error handling in REST APIs.',
            situation: 'Building a REST API with Node.js',
            problem:
              'Cross-cutting concerns like auth and logging are scattered across route handlers',
            goal: 'Centralize request processing with Express.js middleware chains',
            labels: ['nodejs', 'express', 'middleware'],
            scope: 'project',
            requiredLevel: 3,
          },
        ],
      },
      {
        id: 'artifact_smoke_label_filter_python',
        teamId: 'team_smoke',
        scope: 'project',
        labels: ['python', 'backend', 'api'],
        title: 'Python Backend Skills',
        slug: 'python-backend-skills',
        requiredLevel: 3,
        lifecycleState: 'approved',
        capsules: [
          {
            capsuleId: 'capsule_smoke_label_filter_python',
            content:
              'Use Flask blueprints and decorators for REST API route organization and middleware patterns.',
            situation: 'Building a REST API with Python',
            problem: 'Flask route organization becomes unwieldy in larger applications',
            goal: 'Structure Flask apps with blueprints for maintainable REST APIs',
            labels: ['python', 'flask', 'rest'],
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
  'smoke-keyword-dominant': smokeKeywordDominantScenario,
  'smoke-semantic-dominant': smokeSemanticDominantScenario,
  'smoke-graph-plan-selected': smokeGraphPlanSelectedScenario,
  'smoke-graph-plan-fallback-v2': smokeGraphPlanFallbackV2Scenario,
  'smoke-graph-plan-fallback-v1': smokeGraphPlanFallbackV1Scenario,
  'smoke-graph-assisted-v2': smokeGraphAssistedV2Scenario,
  'smoke-graph-assisted-v2-no-graph': smokeGraphAssistedV2NoGraphScenario,
  'smoke-label-filter': smokeLabelFilterScenario,
};

/**
 * Array of all smoke-tier scenarios for iteration.
 */
export const smokeScenarios = Object.values(smokeScenariosMap);
