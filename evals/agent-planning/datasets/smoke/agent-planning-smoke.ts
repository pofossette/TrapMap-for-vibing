import type { AgentPlanningEvalCase } from '@trapmap/contracts/evals';

const minimalSkillFixturePath = 'evals/ingestion/fixtures/minimal-skill/SKILL.md';
const demoSkillFixturePath = 'evals/ingestion/fixtures/demo-full/SKILL.md';
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
    tags: ['smoke', 'ci', 'normal-planning', 'skill-set'],
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
    tags: ['smoke', 'ci', 'normal-planning', 'plan-graph-set'],
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
        path: minimalSkillFixturePath,
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
          guidance: 'Uses the required upgrade sequence under noisy context.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.4,
          guidance: 'Still concludes with the intended migration outcome.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer: 'Upgrade the CI pipeline in a deterministic order.',
      successCriteria: ['upgrade completed', 'validation passed'],
    },
    tags: ['smoke', 'ci', 'high-interference', 'skill-set'],
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
        path: demoSkillFixturePath,
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
    tags: ['smoke', 'testing', 'normal-planning', 'skill-set'],
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
        path: demoSkillFixturePath,
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
    tags: ['smoke', 'testing', 'normal-planning', 'plan-graph-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-triage-missing-evidence',
    variantId: 'task-triage-missing-evidence-skill-set-none',
    variantGroupId: 'skill-set',
    tier: 'smoke',
    taskType: 'selection',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-triage-missing-evidence',
    goldenPath: {
      requiredSteps: [
        'state evidence is insufficient',
        'request missing logs',
        'defer irreversible action',
      ],
      keyActions: ['state evidence is insufficient', 'request missing logs'],
      allowedAlternativeActions: ['list the exact artifacts needed'],
      forbiddenActions: ['approve production rollback', 'claim root cause confirmed'],
      stepWeights: {
        'state evidence is insufficient': 0.4,
        'request missing logs': 0.3,
        'defer irreversible action': 0.3,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.65,
          guidance: 'Preserves uncertainty and asks for the next validating evidence.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.35,
          guidance: 'Concludes with a conservative answer instead of a guessed fix.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Insufficient evidence to confirm the root cause; request the missing logs first.',
      successCriteria: ['insufficient evidence stated', 'missing logs requested'],
    },
    tags: ['smoke', 'conservative-response', 'missing-evidence', 'skill-set'],
  },
];
