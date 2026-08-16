import type { AgentPlanningEvalScenario } from '../../../types/index.js';

// Shared context entries for skill identification scenarios
const cliWorkflowSkillProfile = {
  id: 'skill-profile-cli-workflow',
  kind: 'skill-profile' as const,
  title: 'TrapMap CLI Usage Guide',
  body: [
    '- [skill-profile] TrapMap CLI Usage Guide',
    '  Summary: Command index for TrapMap CLI: session management, retrieval, registration, review, artifact export, feedback, decay maintenance, skill management, operations',
    '  Keywords: cli, trapmap, command-reference, session, retrieval, registration, review, export',
    '  Labels: trapmap, cli, command-reference, operations',
  ].join('\n'),
  summary: 'CLI command index for TrapMap operations',
};

const cliWorkflowCapsuleCard = {
  id: 'capsule-card-cli-retrieval',
  kind: 'capsule-card' as const,
  title: 'TrapMap CLI Usage Guide — cli',
  body: [
    '- [capsule] TrapMap CLI Usage Guide (keyword match: cli)',
    '  Skill: trapmap-cli-usage-guide',
    '  Situation: User needs to check CLI command syntax for TrapMap operations',
    '  Problem: No quick reference for command signatures and flags',
    '  Goal: Provide accurate CLI command reference for the user query',
    '  Content: Command index covering session, retrieval, registration, review, export, feedback, maintenance',
    '  Labels: trapmap, cli, command-reference, operations',
  ].join('\n'),
  summary: 'keyword: cli, score: 0.85',
};

const governanceWorkflowSkillProfile = {
  id: 'skill-profile-governance-workflow',
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

const governanceWorkflowCapsuleCard = {
  id: 'capsule-card-governance-lifecycle',
  kind: 'capsule-card' as const,
  title: 'Workflow With TrapMap — lifecycle',
  body: [
    '- [capsule] Workflow With TrapMap (keyword match: lifecycle)',
    '  Skill: workflow-with-trapmap',
    '  Situation: User needs to understand the full trap lifecycle management flow',
    '  Problem: Lifecycle transitions (active -> review-due -> stale -> expired) require coordinated workflow',
    '  Goal: Guide user through the complete governance workflow for trap lifecycle',
    '  Content: Auth preflight, retrieval, plan, execute, review, export, feedback, maintenance lifecycle',
    '  Labels: trapmap, workflow, governance, lifecycle-management',
  ].join('\n'),
  summary: 'keyword: lifecycle, score: 0.95',
};

// Distractor entries
const dockerDeployProfile = {
  id: 'skill-profile-docker-deploy',
  kind: 'skill-profile' as const,
  title: 'Docker Deployment Best Practices',
  body: [
    '- [skill-profile] Docker Deployment Best Practices',
    '  Summary: Production Docker deployment with multi-stage builds, minimal images, and validated environment config',
    '  Keywords: docker, deployment, production, container, multi-stage',
    '  Labels: docker, deployment, production, container',
  ].join('\n'),
  summary: 'Docker deployment best practices for production',
};

const dockerDeployCapsule = {
  id: 'capsule-card-docker-deploy',
  kind: 'capsule-card' as const,
  title: 'Docker Deployment Best Practices — partial match',
  body: [
    '- [capsule] Docker Deployment Best Practices (keyword match: low-relevance)',
    '  Skill: docker-deploy',
    '  Situation: Tangentially related container deployment context',
    '  Problem: Not directly addressing TrapMap CLI or lifecycle queries',
    '  Goal: Background information only',
    '  Content: Multi-stage builds, layer caching, environment validation',
    '  Labels: docker, deployment, production, container',
  ].join('\n'),
  summary: 'low-relevance distractor',
};

const ciMonitoringProfile = {
  id: 'skill-profile-ci-monitoring',
  kind: 'skill-profile' as const,
  title: 'CI Monitoring Lite',
  body: [
    '- [skill-profile] CI Monitoring Lite',
    '  Summary: Lightweight CI pipeline monitoring with flaky test detection and build health tracking',
    '  Keywords: ci, monitoring, flaky-test, build-health, github-actions, pipeline',
    '  Labels: ci, monitoring, testing, devops',
  ].join('\n'),
  summary: 'CI monitoring with flaky test detection',
};

const ciMonitoringCapsule = {
  id: 'capsule-card-ci-monitoring',
  kind: 'capsule-card' as const,
  title: 'CI Monitoring Lite — partial match',
  body: [
    '- [capsule] CI Monitoring Lite (keyword match: low-relevance)',
    '  Skill: oss-ci-monitoring-lite',
    '  Situation: Tangentially related CI context',
    '  Problem: Not directly addressing the user query',
    '  Goal: Background information only',
    '  Content: Build health tracking, flaky test detection, resource monitoring',
    '  Labels: ci, monitoring, testing, devops',
  ].join('\n'),
  summary: 'low-relevance distractor',
};

const logAnalysisProfile = {
  id: 'skill-profile-log-analysis',
  kind: 'skill-profile' as const,
  title: 'Log Analysis Patterns',
  body: [
    '- [skill-profile] Log Analysis Patterns',
    '  Summary: Systematic log analysis patterns for production incident triage and cross-service correlation',
    '  Keywords: logging, incident-triage, correlation, anomaly-detection, observability',
    '  Labels: observability, logging, incident-response, monitoring',
  ].join('\n'),
  summary: 'Log analysis patterns for incident triage',
};

const logAnalysisCapsule = {
  id: 'capsule-card-log-analysis',
  kind: 'capsule-card' as const,
  title: 'Log Analysis Patterns — partial match',
  body: [
    '- [capsule] Log Analysis Patterns (keyword match: low-relevance)',
    '  Skill: oss-log-analysis-patterns',
    '  Situation: Tangentially related observability context',
    '  Problem: Not directly addressing trap lifecycle or CLI usage',
    '  Goal: Background information only',
    '  Content: Error cascade detection, latency correlation, volume anomaly detection',
    '  Labels: observability, logging, incident-response, monitoring',
  ].join('\n'),
  summary: 'low-relevance distractor',
};

const databaseMigrationProfile = {
  id: 'skill-profile-database-migration',
  kind: 'skill-profile' as const,
  title: 'Database Migration Skill',
  body: [
    '- [skill-profile] Database Migration Skill',
    '  Summary: Database schema migration practices: expand-contract pattern, lock management, rollback safety',
    '  Keywords: database, migration, schema, postgresql, expand-contract, rollback, lock',
    '  Labels: database, migration, postgresql, schema, backend',
  ].join('\n'),
  summary: 'Database migration best practices',
};

const databaseMigrationCapsule = {
  id: 'capsule-card-database-migration',
  kind: 'capsule-card' as const,
  title: 'Database Migration Skill — partial match',
  body: [
    '- [capsule] Database Migration Skill (keyword match: low-relevance)',
    '  Skill: database-migration',
    '  Situation: Tangentially related backend context',
    '  Problem: Not directly addressing the user query about TrapMap workflows',
    '  Goal: Background information only',
    '  Content: Expand-contract pattern, lock management, rollback safety',
    '  Labels: database, migration, postgresql, schema, backend',
  ].join('\n'),
  summary: 'low-relevance distractor',
};

// Shared interference entries (21 items) for skill identification scenarios
function buildInterferenceEntries(
  domainDistractors: Array<{
    profile: typeof dockerDeployProfile;
    capsule: typeof dockerDeployCapsule;
  }>,
): AgentPlanningEvalScenario['context']['interference'] {
  const entries: AgentPlanningEvalScenario['context']['interference'] = [];

  // Domain distractors (items 1-7)
  for (const d of domainDistractors) {
    entries.push(d.profile, d.capsule);
  }

  // Cross-domain noise (items 8-14) — reusing trap entries for volume
  for (let i = 0; i < 7; i++) {
    entries.push({
      id: `noise-cross-domain-skill-profile-${i}`,
      kind: 'skill-profile' as const,
      title: `Cross-domain skill ${i}`,
      body: `- [skill-profile] Cross-domain skill ${i}\n  Summary: Unrelated skill for interference testing\n  Keywords: unrelated, cross-domain\n  Labels: noise`,
      summary: 'cross-domain noise',
    });
  }

  // Far cross-domain noise (items 15-21)
  for (let i = 0; i < 7; i++) {
    entries.push({
      id: `noise-far-cross-domain-capsule-${i}`,
      kind: 'capsule-card' as const,
      title: `Far cross-domain capsule ${i}`,
      body: `- [capsule] Far cross-domain capsule ${i} (keyword match: noise)\n  Skill: noise-${i}\n  Situation: Completely unrelated\n  Problem: N/A\n  Goal: Interference\n  Content: Noise entry\n  Labels: noise`,
      summary: 'far cross-domain noise',
    });
  }

  return entries;
}

export const skillIdentificationSmokeScenarios: AgentPlanningEvalScenario[] = [
  {
    scenarioId: 'scenario-identify-cli-workflow',
    taskId: 'task-identify-cli-workflow',
    variantIds: [
      'task-identify-cli-workflow-skill-summary',
      'task-identify-cli-workflow-capsule-match',
    ],
    taskPrompt:
      'The user asks: "How do I use the TrapMap CLI to check decay status for a skill?" Plan the agent response to identify and apply the correct skill.',
    promptTemplateId: 'default-agent-planning',
    actor: { mode: 'dry-run', provider: 'fallback' },
    context: {
      required: [
        cliWorkflowSkillProfile,
        cliWorkflowCapsuleCard,
        governanceWorkflowSkillProfile,
        governanceWorkflowCapsuleCard,
      ],
      optional: [
        {
          id: 'note-cli-context',
          kind: 'note',
          title: 'CLI context note',
          body: 'The TrapMap CLI provides commands organized by workflow phase.',
        },
      ],
      interference: buildInterferenceEntries([
        { profile: dockerDeployProfile, capsule: dockerDeployCapsule },
        { profile: ciMonitoringProfile, capsule: ciMonitoringCapsule },
      ]),
    },
    metadata: { repository: 'trapmap', owner: 'eval-team' },
  },
  {
    scenarioId: 'scenario-identify-governance-workflow',
    taskId: 'task-identify-governance-workflow',
    variantIds: [
      'task-identify-governance-workflow-skill-summary',
      'task-identify-governance-workflow-capsule-match',
    ],
    taskPrompt:
      'The user asks: "What is the complete lifecycle management flow for traps in TrapMap?" Plan the agent response to identify the governance workflow skill.',
    promptTemplateId: 'default-agent-planning',
    actor: { mode: 'dry-run', provider: 'fallback' },
    context: {
      required: [
        governanceWorkflowSkillProfile,
        governanceWorkflowCapsuleCard,
        cliWorkflowSkillProfile,
        cliWorkflowCapsuleCard,
      ],
      optional: [
        {
          id: 'note-governance-context',
          kind: 'note',
          title: 'Governance context note',
          body: 'Trap lifecycle includes active, review-due, stale, expired, superseded states.',
        },
      ],
      interference: buildInterferenceEntries([
        { profile: logAnalysisProfile, capsule: logAnalysisCapsule },
        { profile: databaseMigrationProfile, capsule: databaseMigrationCapsule },
      ]),
    },
    metadata: { repository: 'trapmap', owner: 'eval-team' },
  },
];
