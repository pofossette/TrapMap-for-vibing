import type { AgentPlanningEvalScenario } from '../../../../types/index.js';

// Re-export smoke scenarios with -core suffix on variantIds only (scenarioId stays original)
import { skillIdentificationSmokeScenarios } from '../../../scenarios/smoke/skill-identification-smoke-scenarios.js';

const promotedSkillIdScenarios: AgentPlanningEvalScenario[] = skillIdentificationSmokeScenarios.map(
  (scenario) => ({
    ...scenario,
    variantIds: scenario.variantIds.map((v) => `${v}-core`),
  }),
);

// Core-only scenario entries (reuse the same context structure as smoke)
const workflowProfile = {
  id: 'skill-profile-workflow-core',
  kind: 'skill-profile' as const,
  title: 'Workflow With TrapMap',
  body: [
    '- [skill-profile] Workflow With TrapMap',
    '  Summary: Retrieve traps and skills before TrapMap work: auth preflight, skill/trap search, load, plan, execute, review, export, feedback, maintenance lifecycle',
    '  Keywords: trapmap, workflow, trap-retrieval, skill-search, lifecycle, governance, decay',
    '  Labels: trapmap, workflow, governance, lifecycle-management',
  ].join('\n'),
  summary: 'Full TrapMap workflow with lifecycle governance',
};

const workflowCapsule = {
  id: 'capsule-card-workflow-lifecycle-core',
  kind: 'capsule-card' as const,
  title: 'Workflow With TrapMap — lifecycle',
  body: [
    '- [capsule] Workflow With TrapMap (keyword match: lifecycle)',
    '  Skill: workflow-with-trapmap',
    '  Situation: User needs to understand the full trap lifecycle management flow',
    '  Problem: Lifecycle transitions require coordinated workflow',
    '  Goal: Guide user through the complete governance workflow',
    '  Content: Auth preflight, retrieval, plan, execute, review, export, feedback, maintenance',
    '  Labels: trapmap, workflow, governance, lifecycle-management',
  ].join('\n'),
  summary: 'keyword: lifecycle, score: 0.95',
};

const ciPipelineProfile = {
  id: 'skill-profile-ci-pipeline-core',
  kind: 'skill-profile' as const,
  title: 'CI/CD Pipeline Skill',
  body: [
    '- [skill-profile] CI/CD Pipeline Skill',
    '  Summary: CI/CD pipeline best practices: stable test timing, Docker layer caching, container startup health checks',
    '  Keywords: ci, pipeline, github-actions, docker, testing, caching, health-check',
    '  Labels: ci, cd, pipeline, testing, devops',
  ].join('\n'),
  summary: 'CI/CD pipeline best practices',
};

const ciPipelineCapsule = {
  id: 'capsule-card-ci-pipeline-core',
  kind: 'capsule-card' as const,
  title: 'CI/CD Pipeline Skill — pipeline',
  body: [
    '- [capsule] CI/CD Pipeline Skill (keyword match: pipeline)',
    '  Skill: ci-pipeline',
    '  Situation: User needs to set up or improve CI/CD pipeline',
    '  Problem: Pipeline instability from timing issues, cache invalidation, and startup races',
    '  Goal: Provide reliable CI pipeline configuration guidance',
    '  Content: Test timing stability, Docker caching, container health checks',
    '  Labels: ci, cd, pipeline, testing, devops',
  ].join('\n'),
  summary: 'keyword: pipeline, score: 0.9',
};

// Distractors for core scenarios
const dockerDeployProfile = {
  id: 'skill-profile-docker-deploy-core',
  kind: 'skill-profile' as const,
  title: 'Docker Deployment Best Practices',
  body: '- [skill-profile] Docker Deployment Best Practices\n  Summary: Production Docker deployment with multi-stage builds\n  Keywords: docker, deployment, production, container\n  Labels: docker, deployment, production, container',
  summary: 'Docker deployment practices',
};

const dockerDeployCapsule = {
  id: 'capsule-card-docker-deploy-core',
  kind: 'capsule-card' as const,
  title: 'Docker Deployment — distractor',
  body: '- [capsule] Docker Deployment (keyword match: low-relevance)\n  Skill: docker-deploy\n  Situation: Tangentially related\n  Problem: Not directly addressing CI pipeline\n  Goal: Background only\n  Content: Multi-stage builds, env config\n  Labels: docker, deployment',
  summary: 'low-relevance distractor',
};

const tsStrictProfile = {
  id: 'skill-profile-ts-strict-core',
  kind: 'skill-profile' as const,
  title: 'TypeScript Strict Mode',
  body: '- [skill-profile] TypeScript Strict Mode\n  Summary: TypeScript strict mode: type narrowing, any leaks, declaration merging\n  Keywords: typescript, strict-mode, type-safety\n  Labels: typescript, strict-mode, type-safety',
  summary: 'TypeScript strict mode guidance',
};

const tsStrictCapsule = {
  id: 'capsule-card-ts-strict-core',
  kind: 'capsule-card' as const,
  title: 'TypeScript Strict Mode — distractor',
  body: '- [capsule] TypeScript Strict Mode (keyword match: low-relevance)\n  Skill: typescript-strict\n  Situation: Tangentially related\n  Problem: Not CI pipeline related\n  Goal: Background only\n  Content: Type narrowing, any leaks\n  Labels: typescript',
  summary: 'low-relevance distractor',
};

const databaseMigrationProfile = {
  id: 'skill-profile-database-migration-core',
  kind: 'skill-profile' as const,
  title: 'Database Migration Skill',
  body: '- [skill-profile] Database Migration Skill\n  Summary: Database schema migration: expand-contract, lock management, rollback safety\n  Keywords: database, migration, schema, postgresql\n  Labels: database, migration, postgresql, backend',
  summary: 'Database migration best practices',
};

const databaseMigrationCapsule = {
  id: 'capsule-card-database-migration-core',
  kind: 'capsule-card' as const,
  title: 'Database Migration — distractor',
  body: '- [capsule] Database Migration (keyword match: low-relevance)\n  Skill: database-migration\n  Situation: Tangentially related\n  Problem: Not CI related\n  Goal: Background only\n  Content: Expand-contract, lock management\n  Labels: database, migration',
  summary: 'low-relevance distractor',
};

const logAnalysisProfile = {
  id: 'skill-profile-log-analysis-core',
  kind: 'skill-profile' as const,
  title: 'Log Analysis Patterns',
  body: '- [skill-profile] Log Analysis Patterns\n  Summary: Systematic log analysis for incident triage\n  Keywords: logging, incident-triage, correlation\n  Labels: observability, logging, incident-response',
  summary: 'Log analysis patterns',
};

const logAnalysisCapsule = {
  id: 'capsule-card-log-analysis-core',
  kind: 'capsule-card' as const,
  title: 'Log Analysis — distractor',
  body: '- [capsule] Log Analysis (keyword match: low-relevance)\n  Skill: oss-log-analysis-patterns\n  Situation: Tangentially related\n  Problem: Not CI pipeline related\n  Goal: Background only\n  Content: Error cascade detection\n  Labels: observability',
  summary: 'low-relevance distractor',
};

const ciMonitoringProfile = {
  id: 'skill-profile-ci-monitoring-core',
  kind: 'skill-profile' as const,
  title: 'CI Monitoring Lite',
  body: '- [skill-profile] CI Monitoring Lite\n  Summary: Lightweight CI pipeline monitoring with flaky test detection\n  Keywords: ci, monitoring, flaky-test, build-health\n  Labels: ci, monitoring, testing, devops',
  summary: 'CI monitoring with flaky test detection',
};

const ciMonitoringCapsule = {
  id: 'capsule-card-ci-monitoring-core',
  kind: 'capsule-card' as const,
  title: 'CI Monitoring Lite — distractor',
  body: '- [capsule] CI Monitoring Lite (keyword match: low-relevance)\n  Skill: oss-ci-monitoring-lite\n  Situation: Tangentially related CI context\n  Problem: Monitoring not pipeline setup\n  Goal: Background only\n  Content: Build health tracking\n  Labels: ci, monitoring',
  summary: 'low-relevance distractor',
};

function buildCoreInterference(
  domainPairs: Array<{ profile: typeof dockerDeployProfile; capsule: typeof dockerDeployCapsule }>,
): AgentPlanningEvalScenario['context']['interference'] {
  const entries: AgentPlanningEvalScenario['context']['interference'] = [];

  for (const d of domainPairs) {
    entries.push(d.profile, d.capsule);
  }

  // Fill to 21 entries
  for (let i = entries.length; i < 14; i++) {
    entries.push({
      id: `noise-core-skill-${i}`,
      kind: 'skill-profile' as const,
      title: `Core noise skill ${i}`,
      body: `- [skill-profile] Core noise ${i}\n  Summary: Interference\n  Keywords: noise\n  Labels: noise`,
      summary: 'noise',
    });
  }
  for (let i = entries.length; i < 21; i++) {
    entries.push({
      id: `noise-core-capsule-${i}`,
      kind: 'capsule-card' as const,
      title: `Core noise capsule ${i}`,
      body: `- [capsule] Core noise ${i} (keyword match: noise)\n  Skill: noise\n  Situation: N/A\n  Problem: N/A\n  Goal: Noise\n  Content: Noise\n  Labels: noise`,
      summary: 'noise',
    });
  }

  return entries;
}

const coreOnlyScenarios: AgentPlanningEvalScenario[] = [
  // Core task 1: repo skill lift
  {
    scenarioId: 'scenario-capsule-lift-repo-skill',
    taskId: 'task-capsule-lift-repo-skill',
    variantIds: [
      'task-capsule-lift-repo-skill-skill-summary',
      'task-capsule-lift-repo-skill-capsule-match',
    ],
    taskPrompt:
      'The user asks: "How do I manage the full trap lifecycle in TrapMap, from creation to expiry?" Identify the best skill and apply it.',
    promptTemplateId: 'default-agent-planning',
    actor: { mode: 'dry-run', provider: 'fallback' },
    context: {
      required: [
        workflowProfile,
        workflowCapsule,
        ciPipelineProfile,
        ciPipelineCapsule,
        databaseMigrationProfile,
        databaseMigrationCapsule,
      ],
      optional: [
        {
          id: 'note-lifecycle-core',
          kind: 'note',
          title: 'Lifecycle note',
          body: 'Trap lifecycle states: active, review-due, stale, expired, superseded.',
        },
      ],
      interference: buildCoreInterference([
        { profile: dockerDeployProfile, capsule: dockerDeployCapsule },
        { profile: tsStrictProfile, capsule: tsStrictCapsule },
      ]),
    },
    metadata: { repository: 'trapmap', owner: 'eval-team' },
  },
  // Core task 2: OSS noisy
  {
    scenarioId: 'scenario-capsule-lift-oss-noisy',
    taskId: 'task-capsule-lift-oss-noisy',
    variantIds: [
      'task-capsule-lift-oss-noisy-skill-summary',
      'task-capsule-lift-oss-noisy-capsule-match',
    ],
    taskPrompt:
      'The user asks: "How do I correlate error logs across microservices during an incident?" Identify the best skill.',
    promptTemplateId: 'default-agent-planning',
    actor: { mode: 'dry-run', provider: 'fallback' },
    context: {
      required: [logAnalysisProfile, logAnalysisCapsule, ciMonitoringProfile, ciMonitoringCapsule],
      optional: [],
      interference: buildCoreInterference([
        { profile: dockerDeployProfile, capsule: dockerDeployCapsule },
        { profile: tsStrictProfile, capsule: tsStrictCapsule },
        { profile: databaseMigrationProfile, capsule: databaseMigrationCapsule },
      ]),
    },
    metadata: { repository: 'mixed', owner: 'eval-team' },
  },
  // Core task 3: distractor rejection multi
  {
    scenarioId: 'scenario-distractor-rejection-multi',
    taskId: 'task-distractor-rejection-multi',
    variantIds: [
      'task-distractor-rejection-multi-skill-summary',
      'task-distractor-rejection-multi-capsule-match',
    ],
    taskPrompt:
      'The user asks: "How do I set up a reliable CI pipeline with proper test timing and Docker caching?" Identify the correct skill among many similar options.',
    promptTemplateId: 'default-agent-planning',
    actor: { mode: 'dry-run', provider: 'fallback' },
    context: {
      required: [
        ciPipelineProfile,
        ciPipelineCapsule,
        dockerDeployProfile,
        dockerDeployCapsule,
        tsStrictProfile,
        tsStrictCapsule,
        ciMonitoringProfile,
        ciMonitoringCapsule,
      ],
      optional: [],
      interference: buildCoreInterference([
        { profile: databaseMigrationProfile, capsule: databaseMigrationCapsule },
        { profile: logAnalysisProfile, capsule: logAnalysisCapsule },
      ]),
    },
    metadata: { repository: 'mixed', owner: 'eval-team' },
  },
  // Core task 4: mixed source accuracy
  {
    scenarioId: 'scenario-mixed-source-accuracy',
    taskId: 'task-mixed-source-accuracy',
    variantIds: [
      'task-mixed-source-accuracy-skill-summary',
      'task-mixed-source-accuracy-capsule-match',
    ],
    taskPrompt:
      'The user asks: "I need to set up TrapMap lifecycle governance and CI monitoring together." Identify the two relevant skills.',
    promptTemplateId: 'default-agent-planning',
    actor: { mode: 'dry-run', provider: 'fallback' },
    context: {
      required: [
        workflowProfile,
        workflowCapsule,
        ciMonitoringProfile,
        ciMonitoringCapsule,
        logAnalysisProfile,
        logAnalysisCapsule,
        databaseMigrationProfile,
        databaseMigrationCapsule,
      ],
      optional: [],
      interference: buildCoreInterference([
        { profile: dockerDeployProfile, capsule: dockerDeployCapsule },
        { profile: tsStrictProfile, capsule: tsStrictCapsule },
      ]),
    },
    metadata: { repository: 'mixed', owner: 'eval-team' },
  },
];

export const skillIdentificationCoreScenarios: AgentPlanningEvalScenario[] = [
  ...promotedSkillIdScenarios,
  ...coreOnlyScenarios,
];
