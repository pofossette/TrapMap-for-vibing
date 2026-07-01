import type { AgentPlanningEvalScenario } from '@trapmap/contracts/evals';

const minimalSkillFixturePath = 'evals/ingestion/fixtures/minimal-skill/SKILL.md';
const demoSkillFixturePath = 'evals/ingestion/fixtures/demo-full/SKILL.md';
const trapFrontendAsyncPath = 'evals/fixtures/traps/frontend/trap_async_race_condition.json';

export const smokeScenarios: AgentPlanningEvalScenario[] = [
  {
    scenarioId: 'scenario-upgrade-ci-pipeline',
    taskId: 'task-upgrade-ci-pipeline',
    variantIds: [
      'task-upgrade-ci-pipeline-skill-set-none',
      'task-upgrade-ci-pipeline-plan-graph-none',
      'task-upgrade-ci-pipeline-skill-set-high',
    ],
    taskPrompt: 'Plan how to upgrade the CI pipeline safely without breaking validation.',
    promptTemplateId: 'default-agent-planning',
    actor: {
      mode: 'dry-run',
      provider: 'fallback',
    },
    context: {
      required: [
        {
          id: 'skill-ci-upgrade',
          kind: 'skill',
          title: 'CI upgrade checklist',
          body: 'Inspect the existing pipeline, apply the migration, then run validation before rollout.',
        },
        {
          id: 'plan-ci-upgrade',
          kind: 'plan-node',
          title: 'CI upgrade graph',
          body: 'inspect current pipeline -> apply migration -> run validation -> conclude upgrade completed',
        },
      ],
      optional: [
        {
          id: 'note-release-notes',
          kind: 'note',
          title: 'Release notes reminder',
          body: 'Review release notes if a breaking change is suspected.',
        },
      ],
      interference: [
        {
          id: 'noise-minimal-skill',
          kind: 'skill',
          title: 'Unrelated minimal skill',
          sourcePath: 'evals/ingestion/fixtures/minimal-skill/SKILL.md',
          summary: 'Used as a low-signal distractor.',
        },
        {
          id: 'noise-trap-flaky-test',
          kind: 'trap',
          title: 'Flaky timing trap',
          sourcePath: 'evals/fixtures/traps/testing/trap_flaky_test_timing.json',
          summary: 'Used as a high-interference distractor.',
        },
      ],
    },
    metadata: {
      repository: 'Trap-Map',
      owner: 'agent-planning-eval',
    },
  },
  {
    scenarioId: 'scenario-debug-flaky-tests',
    taskId: 'task-debug-flaky-tests',
    variantIds: ['task-debug-flaky-tests-skill-set-low', 'task-debug-flaky-tests-plan-graph-low'],
    taskPrompt: 'Plan how to debug flaky tests caused by timing-sensitive assertions.',
    promptTemplateId: 'default-agent-planning',
    actor: {
      mode: 'dry-run',
      provider: 'fallback',
    },
    context: {
      required: [
        {
          id: 'skill-flaky-test-debugging',
          kind: 'skill',
          title: 'Flaky test debugging guide',
          body: 'Reproduce the failure, isolate the timing dependency, then stabilize the assertion strategy.',
        },
        {
          id: 'plan-flaky-test-debugging',
          kind: 'plan-node',
          title: 'Flaky test debug graph',
          body: 'reproduce failure -> isolate flaky timing dependency -> stabilize assertions -> conclude stabilization',
        },
      ],
      optional: [
        {
          id: 'note-assertion-hygiene',
          kind: 'note',
          title: 'Assertion hygiene',
          body: 'Inspect recent test changes before broad remediation.',
        },
      ],
      interference: [
        {
          id: 'noise-demo-full-skill',
          kind: 'skill',
          title: 'Demo fixture skill',
          sourcePath: 'evals/ingestion/fixtures/demo-full/SKILL.md',
          summary: 'Reusable third-party fixture for low interference.',
        },
      ],
    },
    metadata: {
      repository: 'Trap-Map',
      owner: 'agent-planning-eval',
    },
  },
  {
    scenarioId: 'scenario-triage-missing-evidence',
    taskId: 'task-triage-missing-evidence',
    variantIds: ['task-triage-missing-evidence-skill-set-none'],
    taskPrompt:
      'Plan how to respond when an incident report claims a database migration caused an outage, but no logs or rollout timeline are attached.',
    promptTemplateId: 'default-agent-planning',
    actor: {
      mode: 'dry-run',
      provider: 'fallback',
    },
    context: {
      required: [
        {
          id: 'skill-evidence-triage',
          kind: 'skill',
          title: 'Incident evidence triage',
          body: 'If logs are missing, state the evidence gap, request the missing artifacts, and avoid irreversible actions until confirmation.',
        },
      ],
      optional: [
        {
          id: 'note-needed-artifacts',
          kind: 'note',
          title: 'Artifacts to request',
          body: 'Ask for deploy logs, migration timestamps, and the first failing alert sample.',
        },
      ],
      interference: [],
    },
    metadata: {
      repository: 'Trap-Map',
      owner: 'agent-planning-eval',
    },
  },
  {
    scenarioId: 'scenario-rank-deployment-strategy',
    taskId: 'task-rank-deployment-strategy',
    variantIds: [
      'task-rank-deployment-strategy-skill-set-none',
      'task-rank-deployment-strategy-plan-graph-none',
    ],
    taskPrompt:
      'Plan how to select the safest deployment strategy when given blue-green, canary, and rolling-update options for a stateful service.',
    promptTemplateId: 'default-agent-planning',
    actor: {
      mode: 'dry-run',
      provider: 'fallback',
    },
    context: {
      required: [
        {
          id: 'skill-deploy-patterns',
          kind: 'skill',
          title: 'Deployment Patterns',
          body: 'Compare blue-green, canary, and rolling-update strategies by rollback speed, blast radius, and resource cost for stateful workloads.',
        },
        {
          id: 'skill-rollback-procedures',
          kind: 'skill',
          title: 'Rollback Procedures',
          body: 'Define rollback triggers, automated health checks, and manual override steps for each deployment strategy.',
        },
      ],
      optional: [
        {
          id: 'note-service-statefulness',
          kind: 'note',
          title: 'Service Statefulness',
          body: 'Stateful services require session draining and persistent volume coordination during any deployment strategy.',
        },
      ],
      interference: [],
    },
    metadata: {
      repository: 'Trap-Map',
      owner: 'agent-planning-eval',
    },
  },
  {
    scenarioId: 'scenario-coordinate-database-migration',
    taskId: 'task-coordinate-database-migration',
    variantIds: ['task-coordinate-database-migration-skill-set-none'],
    taskPrompt:
      'Plan a database schema migration that requires verifying backups, confirming permissions, running the migration in stages, and validating results before cutover.',
    promptTemplateId: 'default-agent-planning',
    actor: {
      mode: 'dry-run',
      provider: 'fallback',
    },
    context: {
      required: [
        {
          id: 'skill-db-migration',
          kind: 'skill',
          title: 'Database Migration Playbook',
          body: 'Verify backup integrity, confirm migration permissions, execute schema changes in a staged rollout, and validate data integrity before cutover.',
        },
        {
          id: 'skill-backup-verification',
          kind: 'skill',
          title: 'Backup Verification',
          body: 'Check backup freshness, test restore capability, and confirm point-in-time recovery options before starting any migration.',
        },
      ],
      optional: [
        {
          id: 'note-staging-env',
          kind: 'note',
          title: 'Staging Environment',
          body: 'Run the migration against the staging environment first and confirm row counts match before production cutover.',
        },
      ],
      interference: [],
    },
    metadata: {
      repository: 'Trap-Map',
      owner: 'agent-planning-eval',
    },
  },
  {
    scenarioId: 'scenario-triage-alert-storm',
    taskId: 'task-triage-alert-storm',
    variantIds: ['task-triage-alert-storm-skill-set-low', 'task-triage-alert-storm-plan-graph-low'],
    taskPrompt:
      'Plan how to triage an alert storm where 200+ alerts fire in 5 minutes and most are cascading side effects rather than root cause indicators.',
    promptTemplateId: 'default-agent-planning',
    actor: {
      mode: 'dry-run',
      provider: 'fallback',
    },
    context: {
      required: [
        {
          id: 'skill-alert-triage',
          kind: 'skill',
          title: 'Alert Triage Guide',
          body: 'Group alerts by time window and dependency graph, filter known cascading patterns, and isolate the earliest root-cause signal.',
        },
        {
          id: 'plan-alert-triage',
          kind: 'plan-node',
          title: 'Alert triage graph',
          body: 'identify alert correlation window -> filter cascading side-effect alerts -> isolate root-cause alert -> confirm single root cause',
        },
      ],
      optional: [
        {
          id: 'note-monitoring-stack',
          kind: 'note',
          title: 'Monitoring Stack',
          body: 'Alerts originate from Prometheus alertmanager with PagerDuty integration; cascading alerts often correlate with shared dependency failures.',
        },
      ],
      interference: [
        {
          id: 'noise-demo-full-skill-alert',
          kind: 'skill',
          title: 'General-purpose skill distractor',
          sourcePath: demoSkillFixturePath,
          summary: 'Non-monitoring skill used as a low-signal distractor.',
        },
      ],
    },
    metadata: {
      repository: 'Trap-Map',
      owner: 'agent-planning-eval',
    },
  },
  {
    scenarioId: 'scenario-rollback-feature-flag',
    taskId: 'task-rollback-feature-flag',
    variantIds: [
      'task-rollback-feature-flag-skill-set-high',
      'task-rollback-feature-flag-plan-graph-none',
    ],
    taskPrompt:
      'Plan how to safely roll back a feature flag that is causing performance degradation in production, while preserving user sessions.',
    promptTemplateId: 'default-agent-planning',
    actor: {
      mode: 'dry-run',
      provider: 'fallback',
    },
    context: {
      required: [
        {
          id: 'skill-feature-flag-rollback',
          kind: 'skill',
          title: 'Feature Flag Rollback',
          body: 'Assess the blast radius of the flag, prepare the rollback toggle, execute a gradual rollout reversal, and verify session preservation throughout.',
        },
      ],
      optional: [
        {
          id: 'note-flag-service-health',
          kind: 'note',
          title: 'Feature Flag Service Health',
          body: 'Check the feature flag service health endpoint before initiating rollback to ensure toggle commands will be processed.',
        },
      ],
      interference: [
        {
          id: 'noise-minimal-skill-rollback',
          kind: 'skill',
          title: 'Unrelated minimal skill',
          sourcePath: minimalSkillFixturePath,
          summary: 'Used as a low-signal distractor under high interference.',
        },
        {
          id: 'noise-trap-frontend-async',
          kind: 'trap',
          title: 'Async race condition trap',
          sourcePath: trapFrontendAsyncPath,
          summary: 'Used as a high-interference distractor from the frontend domain.',
        },
      ],
    },
    metadata: {
      repository: 'Trap-Map',
      owner: 'agent-planning-eval',
    },
  },
];

export const smokeScenariosMap = Object.fromEntries(
  smokeScenarios.map((scenario) => [scenario.scenarioId, scenario]),
);
