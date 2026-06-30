import type { AgentPlanningEvalCase } from '@trapmap/contracts/evals';

const skillFixturePath = 'evals/ingestion/fixtures/minimal-skill/SKILL.md';
const altSkillFixturePath = 'evals/ingestion/fixtures/demo-full/SKILL.md';
const trapFixturePath = 'evals/fixtures/traps/testing/trap_flaky_test_timing.json';

export const agentPlanningSmokeCases: AgentPlanningEvalCase[] = [
  {
    schemaVersion: 1,
    taskId: 'task-upgrade-ci-pipeline',
    variantId: 'task-upgrade-ci-pipeline-skill-set-none',
    variantGroupId: 'skill-set',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'medium',
    contextSetKind: 'skill-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-upgrade-ci-pipeline',
    goldenPath: {
      requiredSteps: ['inspect current pipeline', 'apply migration', 'run validation'],
      keyActions: ['inspect current pipeline', 'run validation'],
      allowedAlternativeActions: ['review release notes'],
      forbiddenActions: ['delete production database'],
      stepWeights: {
        'inspect current pipeline': 0.3,
        'apply migration': 0.4,
        'run validation': 0.3,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required upgrade sequence.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.4,
          guidance: 'Ends with the required final answer.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer: 'Upgrade the CI pipeline in a deterministic order.',
      successCriteria: ['upgrade completed', 'validation passed'],
    },
    tags: ['smoke', 'ci', 'skill-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-upgrade-ci-pipeline',
    variantId: 'task-upgrade-ci-pipeline-plan-graph-none',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'medium',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-upgrade-ci-pipeline',
    goldenPath: {
      requiredSteps: ['inspect current pipeline', 'apply migration', 'run validation'],
      keyActions: ['inspect current pipeline', 'run validation'],
      allowedAlternativeActions: ['review release notes'],
      forbiddenActions: ['delete production database'],
      stepWeights: {
        'inspect current pipeline': 0.3,
        'apply migration': 0.4,
        'run validation': 0.3,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required upgrade sequence.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.4,
          guidance: 'Ends with the required final answer.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer: 'Upgrade the CI pipeline in a deterministic order.',
      successCriteria: ['upgrade completed', 'validation passed'],
    },
    tags: ['smoke', 'ci', 'plan-graph'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-upgrade-ci-pipeline',
    variantId: 'task-upgrade-ci-pipeline-skill-set-high',
    variantGroupId: 'high-interference',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'medium',
    contextSetKind: 'skill-set',
    interferenceLevel: 'high',
    interferenceSources: [
      {
        sourcePool: 'evals/ingestion/fixtures',
        sourceId: 'minimal-skill',
        kind: 'skill',
        path: skillFixturePath,
      },
      {
        sourcePool: 'evals/fixtures/traps/testing',
        sourceId: 'trap_flaky_test_timing',
        kind: 'trap',
        path: trapFixturePath,
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-upgrade-ci-pipeline',
    goldenPath: {
      requiredSteps: ['inspect current pipeline', 'apply migration', 'run validation'],
      keyActions: ['inspect current pipeline', 'run validation'],
      allowedAlternativeActions: ['review release notes'],
      forbiddenActions: ['delete production database'],
      stepWeights: {
        'inspect current pipeline': 0.3,
        'apply migration': 0.4,
        'run validation': 0.3,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required upgrade sequence.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.4,
          guidance: 'Ends with the required final answer.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer: 'Upgrade the CI pipeline in a deterministic order.',
      successCriteria: ['upgrade completed', 'validation passed'],
    },
    tags: ['smoke', 'ci', 'high-interference'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-debug-flaky-tests',
    variantId: 'task-debug-flaky-tests-skill-set-low',
    variantGroupId: 'low-interference',
    tier: 'smoke',
    taskType: 'debugging',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'low',
    interferenceSources: [
      {
        sourcePool: 'evals/ingestion/fixtures',
        sourceId: 'demo-full',
        kind: 'skill',
        path: altSkillFixturePath,
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-debug-flaky-tests',
    goldenPath: {
      requiredSteps: [
        'reproduce failure',
        'isolate flaky timing dependency',
        'stabilize assertions',
      ],
      keyActions: ['reproduce failure', 'stabilize assertions'],
      allowedAlternativeActions: ['inspect recent test changes'],
      forbiddenActions: ['disable the entire test suite'],
      stepWeights: {
        'reproduce failure': 0.3,
        'isolate flaky timing dependency': 0.3,
        'stabilize assertions': 0.4,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.7,
          guidance: 'Uses a debugging-first sequence.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.3,
          guidance: 'Ends with the expected remediation summary.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Stabilize flaky tests by reproducing, isolating, and fixing the timing dependency.',
      successCriteria: ['failure reproduced', 'timing issue isolated', 'assertions stabilized'],
    },
    tags: ['smoke', 'testing', 'skill-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-debug-flaky-tests',
    variantId: 'task-debug-flaky-tests-plan-graph-low',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'debugging',
    taskComplexity: 'simple',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'low',
    interferenceSources: [
      {
        sourcePool: 'evals/ingestion/fixtures',
        sourceId: 'demo-full',
        kind: 'skill',
        path: altSkillFixturePath,
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-debug-flaky-tests',
    goldenPath: {
      requiredSteps: [
        'reproduce failure',
        'isolate flaky timing dependency',
        'stabilize assertions',
      ],
      keyActions: ['reproduce failure', 'stabilize assertions'],
      allowedAlternativeActions: ['inspect recent test changes'],
      forbiddenActions: ['disable the entire test suite'],
      stepWeights: {
        'reproduce failure': 0.3,
        'isolate flaky timing dependency': 0.3,
        'stabilize assertions': 0.4,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.7,
          guidance: 'Uses a debugging-first sequence.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.3,
          guidance: 'Ends with the expected remediation summary.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Stabilize flaky tests by reproducing, isolating, and fixing the timing dependency.',
      successCriteria: ['failure reproduced', 'timing issue isolated', 'assertions stabilized'],
    },
    tags: ['smoke', 'testing', 'plan-graph'],
  },
];
