import type { AgentPlanningEvalScenario } from '@trapmap/contracts/evals';

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
];

export const smokeScenariosMap = Object.fromEntries(
  smokeScenarios.map((scenario) => [scenario.scenarioId, scenario]),
);
