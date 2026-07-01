import type { AgentPlanningEvalCase } from '@trapmap/contracts/evals';

const minimalSkillFixturePath = 'evals/ingestion/fixtures/minimal-skill/SKILL.md';
const demoSkillFixturePath = 'evals/ingestion/fixtures/demo-full/SKILL.md';
const trapFixturePath = 'evals/fixtures/traps/testing/trap_flaky_test_timing.json';
const trapFrontendAsyncPath = 'evals/fixtures/traps/frontend/trap_async_race_condition.json';
const trapMonitoringBlindSpotPath =
  'evals/fixtures/traps/cross-domain/trap_monitoring_blind_spot.json';
const trapDeployOrderPath = 'evals/fixtures/traps/cross-domain/trap_fullstack_deploy_order.json';

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
  {
    schemaVersion: 1,
    taskId: 'task-rank-deployment-strategy',
    variantId: 'task-rank-deployment-strategy-skill-set-none',
    variantGroupId: 'skill-set',
    tier: 'smoke',
    taskType: 'selection',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-rank-deployment-strategy',
    goldenPath: {
      requiredSteps: [
        'evaluate candidate strategies',
        'assess risk for each candidate',
        'select safest deployment strategy',
        'document selection rationale',
      ],
      keyActions: ['evaluate candidate strategies', 'select safest deployment strategy'],
      allowedAlternativeActions: ['request staging environment data'],
      forbiddenActions: ['skip risk assessment', 'deploy without rollback plan'],
      stepWeights: {
        'evaluate candidate strategies': 0.25,
        'assess risk for each candidate': 0.25,
        'select safest deployment strategy': 0.3,
        'document selection rationale': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path Correctness',
          weight: 0.6,
          guidance:
            'Evaluate whether the plan correctly identifies and ranks candidate strategies by risk.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.4,
          guidance: 'The final answer should name the safest strategy with justification.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Select blue-green deployment as the safest strategy for a stateful service, with rollback capability at each stage.',
      successCriteria: ['risk assessment completed', 'safest strategy selected'],
    },
    tags: ['smoke', 'deployment', 'selection-ranking', 'skill-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-rank-deployment-strategy',
    variantId: 'task-rank-deployment-strategy-plan-graph-none',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'selection',
    taskComplexity: 'simple',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-rank-deployment-strategy',
    goldenPath: {
      requiredSteps: [
        'evaluate candidate strategies',
        'assess risk for each candidate',
        'select safest deployment strategy',
        'document selection rationale',
      ],
      keyActions: ['evaluate candidate strategies', 'select safest deployment strategy'],
      allowedAlternativeActions: ['request staging environment data'],
      forbiddenActions: ['skip risk assessment', 'deploy without rollback plan'],
      stepWeights: {
        'evaluate candidate strategies': 0.25,
        'assess risk for each candidate': 0.25,
        'select safest deployment strategy': 0.3,
        'document selection rationale': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path Correctness',
          weight: 0.6,
          guidance:
            'Evaluate whether the plan correctly identifies and ranks candidate strategies by risk.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.4,
          guidance: 'The final answer should name the safest strategy with justification.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Select blue-green deployment as the safest strategy for a stateful service, with rollback capability at each stage.',
      successCriteria: ['risk assessment completed', 'safest strategy selected'],
    },
    tags: ['smoke', 'deployment', 'selection-ranking', 'plan-graph-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-coordinate-database-migration',
    variantId: 'task-coordinate-database-migration-skill-set-none',
    variantGroupId: 'skill-set',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'medium',
    contextSetKind: 'skill-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-coordinate-database-migration',
    goldenPath: {
      requiredSteps: [
        'verify backup exists',
        'check migration permissions',
        'run schema migration',
        'validate migration results',
      ],
      keyActions: ['verify backup exists', 'run schema migration', 'validate migration results'],
      allowedAlternativeActions: ['schedule maintenance window'],
      forbiddenActions: ['skip backup verification', 'run migration without staging'],
      stepWeights: {
        'verify backup exists': 0.2,
        'check migration permissions': 0.2,
        'run schema migration': 0.35,
        'validate migration results': 0.25,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path Correctness',
          weight: 0.65,
          guidance: 'Evaluate whether the plan sequences prerequisite checks before execution.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.35,
          guidance: 'The final answer should summarize the full staged migration flow.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Complete the database migration by verifying backups, confirming permissions, executing in stages, and validating before cutover.',
      successCriteria: ['backup verified', 'migration executed', 'results validated'],
    },
    tags: ['smoke', 'database', 'composite-coordination', 'skill-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-triage-alert-storm',
    variantId: 'task-triage-alert-storm-skill-set-low',
    variantGroupId: 'low-interference',
    tier: 'smoke',
    taskType: 'debugging',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'low',
    interferenceSources: [
      {
        sourcePool: 'ingestion/fixtures',
        sourceId: 'demo-full',
        kind: 'skill',
        path: demoSkillFixturePath,
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-triage-alert-storm',
    goldenPath: {
      requiredSteps: [
        'identify alert correlation window',
        'filter cascading side-effect alerts',
        'isolate root-cause alert',
        'confirm single root cause',
      ],
      keyActions: ['filter cascading side-effect alerts', 'isolate root-cause alert'],
      allowedAlternativeActions: ['check monitoring dashboard for anomalies'],
      forbiddenActions: [
        'silence all alerts without investigation',
        'restart all services simultaneously',
      ],
      stepWeights: {
        'identify alert correlation window': 0.2,
        'filter cascading side-effect alerts': 0.3,
        'isolate root-cause alert': 0.3,
        'confirm single root cause': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path Correctness',
          weight: 0.65,
          guidance:
            'Evaluate whether the plan correctly filters noise and isolates the root cause.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.35,
          guidance: 'The final answer should describe the filtering and isolation approach.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Triage the alert storm by filtering cascading alerts, isolating the root-cause indicator, and confirming a single root cause before remediation.',
      successCriteria: ['cascading alerts filtered', 'root cause isolated'],
    },
    tags: ['smoke', 'monitoring', 'debugging', 'skill-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-triage-alert-storm',
    variantId: 'task-triage-alert-storm-plan-graph-low',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'debugging',
    taskComplexity: 'simple',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'low',
    interferenceSources: [
      {
        sourcePool: 'ingestion/fixtures',
        sourceId: 'demo-full',
        kind: 'skill',
        path: demoSkillFixturePath,
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-triage-alert-storm',
    goldenPath: {
      requiredSteps: [
        'identify alert correlation window',
        'filter cascading side-effect alerts',
        'isolate root-cause alert',
        'confirm single root cause',
      ],
      keyActions: ['filter cascading side-effect alerts', 'isolate root-cause alert'],
      allowedAlternativeActions: ['check monitoring dashboard for anomalies'],
      forbiddenActions: [
        'silence all alerts without investigation',
        'restart all services simultaneously',
      ],
      stepWeights: {
        'identify alert correlation window': 0.2,
        'filter cascading side-effect alerts': 0.3,
        'isolate root-cause alert': 0.3,
        'confirm single root cause': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path Correctness',
          weight: 0.65,
          guidance:
            'Evaluate whether the plan correctly filters noise and isolates the root cause.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.35,
          guidance: 'The final answer should describe the filtering and isolation approach.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Triage the alert storm by filtering cascading alerts, isolating the root-cause indicator, and confirming a single root cause before remediation.',
      successCriteria: ['cascading alerts filtered', 'root cause isolated'],
    },
    tags: ['smoke', 'monitoring', 'debugging', 'plan-graph-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-rollback-feature-flag',
    variantId: 'task-rollback-feature-flag-skill-set-high',
    variantGroupId: 'high-interference',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'medium',
    contextSetKind: 'skill-set',
    interferenceLevel: 'high',
    interferenceSources: [
      {
        sourcePool: 'ingestion/fixtures',
        sourceId: 'minimal-skill',
        kind: 'skill',
        path: minimalSkillFixturePath,
      },
      {
        sourcePool: 'fixtures/traps',
        sourceId: 'trap_frontend_async_race_condition',
        kind: 'trap',
        path: trapFrontendAsyncPath,
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-rollback-feature-flag',
    goldenPath: {
      requiredSteps: [
        'assess blast radius of feature flag',
        'prepare rollback toggle',
        'execute gradual rollout reversal',
        'verify session preservation',
      ],
      keyActions: ['assess blast radius of feature flag', 'execute gradual rollout reversal'],
      allowedAlternativeActions: ['check feature flag service health'],
      forbiddenActions: ['disable flag without assessing impact', 'force-kill user sessions'],
      stepWeights: {
        'assess blast radius of feature flag': 0.3,
        'prepare rollback toggle': 0.2,
        'execute gradual rollout reversal': 0.3,
        'verify session preservation': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path Correctness',
          weight: 0.6,
          guidance:
            'Evaluate whether the plan assesses impact before acting and preserves sessions. Under noisy context, the plan should still follow a safe rollback sequence.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.4,
          guidance:
            'Still concludes with the intended rollback outcome despite high-interference context.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Roll back the feature flag gradually while monitoring performance recovery and preserving active user sessions.',
      successCriteria: ['blast radius assessed', 'sessions preserved'],
    },
    tags: ['smoke', 'feature-flags', 'high-interference', 'skill-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-rollback-feature-flag',
    variantId: 'task-rollback-feature-flag-plan-graph-none',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'medium',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-rollback-feature-flag',
    goldenPath: {
      requiredSteps: [
        'assess blast radius of feature flag',
        'prepare rollback toggle',
        'execute gradual rollout reversal',
        'verify session preservation',
      ],
      keyActions: ['assess blast radius of feature flag', 'execute gradual rollout reversal'],
      allowedAlternativeActions: ['check feature flag service health'],
      forbiddenActions: ['disable flag without assessing impact', 'force-kill user sessions'],
      stepWeights: {
        'assess blast radius of feature flag': 0.3,
        'prepare rollback toggle': 0.2,
        'execute gradual rollout reversal': 0.3,
        'verify session preservation': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path Correctness',
          weight: 0.6,
          guidance:
            'Evaluate whether the plan assesses impact before acting and preserves sessions.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.4,
          guidance:
            'The final answer should describe the gradual rollback and session preservation approach.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Roll back the feature flag gradually while monitoring performance recovery and preserving active user sessions.',
      successCriteria: ['blast radius assessed', 'sessions preserved'],
    },
    tags: ['smoke', 'feature-flags', 'normal-planning', 'plan-graph-set'],
  },
];
