import type { AgentPlanningEvalCase } from '../../../types/index.js';

const minimalSkillFixturePath = 'evals/ingestion/fixtures/minimal-skill/SKILL.md';
const demoSkillFixturePath = 'evals/ingestion/fixtures/demo-full/SKILL.md';
const trapFixturePath = 'evals/fixtures/traps/testing/trap_flaky_test_timing.json';
const trapFrontendAsyncPath = 'evals/fixtures/traps/frontend/trap_async_race_condition.json';
const _trapMonitoringBlindSpotPath =
  'evals/fixtures/traps/cross-domain/trap_monitoring_blind_spot.json';
const _trapDeployOrderPath = 'evals/fixtures/traps/cross-domain/trap_fullstack_deploy_order.json';

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
  // ── Supplementary variant: task-rollback-feature-flag-plan-graph-medium ──
  {
    schemaVersion: 1,
    taskId: 'task-rollback-feature-flag',
    variantId: 'task-rollback-feature-flag-plan-graph-medium',
    variantGroupId: 'medium-interference',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'medium',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'medium',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/infra',
        sourceId: 'trap_helm_chart_drift',
        kind: 'trap',
        path: 'evals/fixtures/traps/infra/trap_helm_chart_drift.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/cross-domain',
        sourceId: 'trap_fullstack_deploy_order',
        kind: 'trap',
        path: 'evals/fixtures/traps/cross-domain/trap_fullstack_deploy_order.json',
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
            'Evaluate whether the plan assesses impact before acting and preserves sessions under medium-interference context.',
        },
        {
          id: 'final-answer',
          label: 'Final Answer',
          weight: 0.4,
          guidance:
            'Still concludes with the intended rollback outcome despite medium-interference context.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Roll back the feature flag gradually while monitoring performance recovery and preserving active user sessions.',
      successCriteria: ['blast radius assessed', 'sessions preserved'],
    },
    tags: ['smoke', 'feature-flags', 'medium-interference', 'plan-graph-set'],
  },
  // ── Supplementary variant: task-triage-alert-storm-skill-set-medium ──
  {
    schemaVersion: 1,
    taskId: 'task-triage-alert-storm',
    variantId: 'task-triage-alert-storm-skill-set-medium',
    variantGroupId: 'medium-interference',
    tier: 'smoke',
    taskType: 'debugging',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'medium',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/cross-domain',
        sourceId: 'trap_monitoring_blind_spot',
        kind: 'trap',
        path: 'evals/fixtures/traps/cross-domain/trap_monitoring_blind_spot.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/infra',
        sourceId: 'trap_k8s_oom_kill',
        kind: 'trap',
        path: 'evals/fixtures/traps/infra/trap_k8s_oom_kill.json',
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
            'Evaluate whether the plan correctly filters noise and isolates the root cause under medium-interference context.',
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
    tags: ['smoke', 'monitoring', 'debugging', 'medium-interference', 'skill-set'],
  },
  // ── Supplementary variant: task-rank-deployment-strategy-skill-set-medium ──
  {
    schemaVersion: 1,
    taskId: 'task-rank-deployment-strategy',
    variantId: 'task-rank-deployment-strategy-skill-set-medium',
    variantGroupId: 'medium-interference',
    tier: 'smoke',
    taskType: 'selection',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'medium',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/infra',
        sourceId: 'trap_helm_chart_drift',
        kind: 'trap',
        path: 'evals/fixtures/traps/infra/trap_helm_chart_drift.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/cross-domain',
        sourceId: 'trap_fullstack_deploy_order',
        kind: 'trap',
        path: 'evals/fixtures/traps/cross-domain/trap_fullstack_deploy_order.json',
      },
    ],
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
            'Evaluate whether the plan correctly identifies and ranks candidate strategies by risk under medium-interference context.',
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
    tags: ['smoke', 'deployment', 'selection-ranking', 'medium-interference', 'skill-set'],
  },
  // ── Supplementary variant: task-coordinate-database-migration-skill-set-high ──
  {
    schemaVersion: 1,
    taskId: 'task-coordinate-database-migration',
    variantId: 'task-coordinate-database-migration-skill-set-high',
    variantGroupId: 'high-interference',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'medium',
    contextSetKind: 'skill-set',
    interferenceLevel: 'high',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/backend',
        sourceId: 'trap_transaction_deadlock',
        kind: 'trap',
        path: 'evals/fixtures/traps/backend/trap_transaction_deadlock.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/backend',
        sourceId: 'trap_connection_pool_exhaustion',
        kind: 'trap',
        path: 'evals/fixtures/traps/backend/trap_connection_pool_exhaustion.json',
      },
    ],
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
          guidance:
            'Evaluate whether the plan sequences prerequisite checks before execution under high-interference context.',
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
    tags: ['smoke', 'database', 'composite-coordination', 'high-interference', 'skill-set'],
  },
  // ── Supplementary variant: task-debug-flaky-tests-skill-set-high ──
  {
    schemaVersion: 1,
    taskId: 'task-debug-flaky-tests',
    variantId: 'task-debug-flaky-tests-skill-set-high',
    variantGroupId: 'high-interference',
    tier: 'smoke',
    taskType: 'debugging',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'high',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/testing',
        sourceId: 'trap_mock_state_leakage',
        kind: 'trap',
        path: 'evals/fixtures/traps/testing/trap_mock_state_leakage.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/testing',
        sourceId: 'trap_setup_teardown_order',
        kind: 'trap',
        path: 'evals/fixtures/traps/testing/trap_setup_teardown_order.json',
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
          guidance: 'Uses a debugging-first sequence under high-interference context.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.3,
          guidance: 'Ends with the expected remediation summary despite noisy context.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer:
        'Stabilize flaky tests by reproducing, isolating, and fixing the timing dependency.',
      successCriteria: ['failure reproduced', 'timing issue isolated', 'assertions stabilized'],
    },
    tags: ['smoke', 'testing', 'high-interference', 'skill-set'],
  },
  // ── Supplementary variant: task-upgrade-ci-pipeline-plan-graph-high ──
  {
    schemaVersion: 1,
    taskId: 'task-upgrade-ci-pipeline',
    variantId: 'task-upgrade-ci-pipeline-plan-graph-high',
    variantGroupId: 'high-interference',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'medium',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'high',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/testing',
        sourceId: 'trap_flaky_test_timing',
        kind: 'trap',
        path: 'evals/fixtures/traps/testing/trap_flaky_test_timing.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/infra',
        sourceId: 'trap_ci_timeout_slow_test',
        kind: 'trap',
        path: 'evals/fixtures/traps/infra/trap_ci_timeout_slow_test.json',
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
          guidance: 'Uses the required upgrade sequence under high-interference context.',
        },
        {
          id: 'final-answer',
          label: 'Final answer quality',
          weight: 0.4,
          guidance: 'Still concludes with the intended migration outcome despite noisy context.',
        },
      ],
    },
    expectedOutcome: {
      finalAnswer: 'Upgrade the CI pipeline in a deterministic order.',
      successCriteria: ['upgrade completed', 'validation passed'],
    },
    tags: ['smoke', 'ci', 'high-interference', 'plan-graph-set'],
  },
  // ── New scenario cases: task-setup-code-quality-pipeline ──
  {
    schemaVersion: 1,
    taskId: 'task-setup-code-quality-pipeline',
    variantId: 'task-setup-code-quality-pipeline-skill-set-none',
    variantGroupId: 'skill-set',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-setup-code-quality-pipeline',
    goldenPath: {
      requiredSteps: [
        'configure linting rules',
        'set up formatting standards',
        'add pre-commit hooks',
        'verify pipeline runs',
      ],
      keyActions: ['configure linting rules', 'verify pipeline runs'],
      allowedAlternativeActions: ['review existing code style guide'],
      forbiddenActions: ['skip linting for speed', 'disable pre-commit hooks'],
      stepWeights: {
        'configure linting rules': 0.25,
        'set up formatting standards': 0.25,
        'add pre-commit hooks': 0.25,
        'verify pipeline runs': 0.25,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required quality pipeline sequence.',
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
      finalAnswer:
        'Set up a code quality pipeline by configuring linting, formatting, and pre-commit hooks, then verifying the full pipeline runs successfully.',
      successCriteria: ['linting configured', 'pipeline verified'],
    },
    tags: ['smoke', 'code-quality', 'normal-planning', 'skill-set', 'simple-task'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-setup-code-quality-pipeline',
    variantId: 'task-setup-code-quality-pipeline-plan-graph-none',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'simple',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-setup-code-quality-pipeline',
    goldenPath: {
      requiredSteps: [
        'configure linting rules',
        'set up formatting standards',
        'add pre-commit hooks',
        'verify pipeline runs',
      ],
      keyActions: ['configure linting rules', 'verify pipeline runs'],
      allowedAlternativeActions: ['review existing code style guide'],
      forbiddenActions: ['skip linting for speed', 'disable pre-commit hooks'],
      stepWeights: {
        'configure linting rules': 0.25,
        'set up formatting standards': 0.25,
        'add pre-commit hooks': 0.25,
        'verify pipeline runs': 0.25,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required quality pipeline sequence.',
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
      finalAnswer:
        'Set up a code quality pipeline by configuring linting, formatting, and pre-commit hooks, then verifying the full pipeline runs successfully.',
      successCriteria: ['linting configured', 'pipeline verified'],
    },
    tags: ['smoke', 'code-quality', 'normal-planning', 'plan-graph-set', 'simple-task'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-setup-code-quality-pipeline',
    variantId: 'task-setup-code-quality-pipeline-skill-set-low',
    variantGroupId: 'low-interference',
    tier: 'smoke',
    taskType: 'sequential',
    taskComplexity: 'simple',
    contextSetKind: 'skill-set',
    interferenceLevel: 'low',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/infra',
        sourceId: 'trap_ci_timeout_slow_test',
        kind: 'trap',
        path: 'evals/fixtures/traps/infra/trap_ci_timeout_slow_test.json',
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-setup-code-quality-pipeline',
    goldenPath: {
      requiredSteps: [
        'configure linting rules',
        'set up formatting standards',
        'add pre-commit hooks',
        'verify pipeline runs',
      ],
      keyActions: ['configure linting rules', 'verify pipeline runs'],
      allowedAlternativeActions: ['review existing code style guide'],
      forbiddenActions: ['skip linting for speed', 'disable pre-commit hooks'],
      stepWeights: {
        'configure linting rules': 0.25,
        'set up formatting standards': 0.25,
        'add pre-commit hooks': 0.25,
        'verify pipeline runs': 0.25,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required quality pipeline sequence under low-interference context.',
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
      finalAnswer:
        'Set up a code quality pipeline by configuring linting, formatting, and pre-commit hooks, then verifying the full pipeline runs successfully.',
      successCriteria: ['linting configured', 'pipeline verified'],
    },
    tags: ['smoke', 'code-quality', 'low-interference', 'skill-set', 'simple-task'],
  },
  // ── New scenario cases: task-migrate-auth-microservice ──
  {
    schemaVersion: 1,
    taskId: 'task-migrate-auth-microservice',
    variantId: 'task-migrate-auth-microservice-skill-set-none',
    variantGroupId: 'skill-set',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'medium',
    contextSetKind: 'skill-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-migrate-auth-microservice',
    goldenPath: {
      requiredSteps: [
        'audit existing tokens',
        'configure OAuth provider',
        'migrate session store',
        'map RBAC permissions',
        'validate gateway auth',
      ],
      keyActions: ['audit existing tokens', 'migrate session store', 'validate gateway auth'],
      allowedAlternativeActions: ['review OAuth provider documentation'],
      forbiddenActions: ['skip token audit', 'migrate without rollback plan'],
      stepWeights: {
        'audit existing tokens': 0.15,
        'configure OAuth provider': 0.2,
        'migrate session store': 0.25,
        'map RBAC permissions': 0.2,
        'validate gateway auth': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required auth migration sequence.',
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
      finalAnswer:
        'Migrate the auth microservice by auditing tokens, configuring the OAuth provider, migrating sessions, mapping RBAC, and validating gateway authentication.',
      successCriteria: ['tokens audited', 'sessions migrated', 'gateway validated'],
    },
    tags: ['smoke', 'auth', 'composite-coordination', 'skill-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-migrate-auth-microservice',
    variantId: 'task-migrate-auth-microservice-plan-graph-none',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'medium',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-migrate-auth-microservice',
    goldenPath: {
      requiredSteps: [
        'audit existing tokens',
        'configure OAuth provider',
        'migrate session store',
        'map RBAC permissions',
        'validate gateway auth',
      ],
      keyActions: ['audit existing tokens', 'migrate session store', 'validate gateway auth'],
      allowedAlternativeActions: ['review OAuth provider documentation'],
      forbiddenActions: ['skip token audit', 'migrate without rollback plan'],
      stepWeights: {
        'audit existing tokens': 0.15,
        'configure OAuth provider': 0.2,
        'migrate session store': 0.25,
        'map RBAC permissions': 0.2,
        'validate gateway auth': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required auth migration sequence.',
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
      finalAnswer:
        'Migrate the auth microservice by auditing tokens, configuring the OAuth provider, migrating sessions, mapping RBAC, and validating gateway authentication.',
      successCriteria: ['tokens audited', 'sessions migrated', 'gateway validated'],
    },
    tags: ['smoke', 'auth', 'composite-coordination', 'plan-graph-set'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-migrate-auth-microservice',
    variantId: 'task-migrate-auth-microservice-skill-set-medium',
    variantGroupId: 'medium-interference',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'medium',
    contextSetKind: 'skill-set',
    interferenceLevel: 'medium',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/infra',
        sourceId: 'trap_tls_cert_rotation',
        kind: 'trap',
        path: 'evals/fixtures/traps/infra/trap_tls_cert_rotation.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/cross-domain',
        sourceId: 'trap_secrets_rotation_cascade',
        kind: 'trap',
        path: 'evals/fixtures/traps/cross-domain/trap_secrets_rotation_cascade.json',
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-migrate-auth-microservice',
    goldenPath: {
      requiredSteps: [
        'audit existing tokens',
        'configure OAuth provider',
        'migrate session store',
        'map RBAC permissions',
        'validate gateway auth',
      ],
      keyActions: ['audit existing tokens', 'migrate session store', 'validate gateway auth'],
      allowedAlternativeActions: ['review OAuth provider documentation'],
      forbiddenActions: ['skip token audit', 'migrate without rollback plan'],
      stepWeights: {
        'audit existing tokens': 0.15,
        'configure OAuth provider': 0.2,
        'migrate session store': 0.25,
        'map RBAC permissions': 0.2,
        'validate gateway auth': 0.2,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required auth migration sequence under medium-interference context.',
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
      finalAnswer:
        'Migrate the auth microservice by auditing tokens, configuring the OAuth provider, migrating sessions, mapping RBAC, and validating gateway authentication.',
      successCriteria: ['tokens audited', 'sessions migrated', 'gateway validated'],
    },
    tags: ['smoke', 'auth', 'composite-coordination', 'medium-interference', 'skill-set'],
  },
  // ── New scenario cases: task-replatform-legacy-monolith ──
  {
    schemaVersion: 1,
    taskId: 'task-replatform-legacy-monolith',
    variantId: 'task-replatform-legacy-monolith-skill-set-none',
    variantGroupId: 'skill-set',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'complex',
    contextSetKind: 'skill-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-replatform-legacy-monolith',
    goldenPath: {
      requiredSteps: [
        'decompose monolith services',
        'design API contracts',
        'migrate data stores',
        'deploy service mesh',
        'set up observability',
        'configure feature toggles',
        'shift traffic incrementally',
        'validate rollback readiness',
        'complete team handoff',
      ],
      keyActions: [
        'decompose monolith services',
        'migrate data stores',
        'shift traffic incrementally',
        'complete team handoff',
      ],
      allowedAlternativeActions: ['review domain-driven design boundaries'],
      forbiddenActions: ['big-bang migration', 'skip observability setup'],
      stepWeights: {
        'decompose monolith services': 0.12,
        'design API contracts': 0.1,
        'migrate data stores': 0.15,
        'deploy service mesh': 0.1,
        'set up observability': 0.1,
        'configure feature toggles': 0.1,
        'shift traffic incrementally': 0.13,
        'validate rollback readiness': 0.1,
        'complete team handoff': 0.1,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required replatforming sequence.',
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
      finalAnswer:
        'Replatform the legacy monolith by decomposing services, migrating data, deploying the mesh, and shifting traffic incrementally with rollback readiness.',
      successCriteria: [
        'monolith decomposed',
        'data migrated',
        'traffic shifted',
        'rollback ready',
      ],
    },
    tags: ['smoke', 'replatforming', 'composite-coordination', 'skill-set', 'complex-task'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-replatform-legacy-monolith',
    variantId: 'task-replatform-legacy-monolith-plan-graph-none',
    variantGroupId: 'plan-graph-set',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'complex',
    contextSetKind: 'plan-graph-set',
    interferenceLevel: 'none',
    interferenceSources: [],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-replatform-legacy-monolith',
    goldenPath: {
      requiredSteps: [
        'decompose monolith services',
        'design API contracts',
        'migrate data stores',
        'deploy service mesh',
        'set up observability',
        'configure feature toggles',
        'shift traffic incrementally',
        'validate rollback readiness',
        'complete team handoff',
      ],
      keyActions: [
        'decompose monolith services',
        'migrate data stores',
        'shift traffic incrementally',
        'complete team handoff',
      ],
      allowedAlternativeActions: ['review domain-driven design boundaries'],
      forbiddenActions: ['big-bang migration', 'skip observability setup'],
      stepWeights: {
        'decompose monolith services': 0.12,
        'design API contracts': 0.1,
        'migrate data stores': 0.15,
        'deploy service mesh': 0.1,
        'set up observability': 0.1,
        'configure feature toggles': 0.1,
        'shift traffic incrementally': 0.13,
        'validate rollback readiness': 0.1,
        'complete team handoff': 0.1,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required replatforming sequence.',
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
      finalAnswer:
        'Replatform the legacy monolith by decomposing services, migrating data, deploying the mesh, and shifting traffic incrementally with rollback readiness.',
      successCriteria: [
        'monolith decomposed',
        'data migrated',
        'traffic shifted',
        'rollback ready',
      ],
    },
    tags: ['smoke', 'replatforming', 'composite-coordination', 'plan-graph-set', 'complex-task'],
  },
  {
    schemaVersion: 1,
    taskId: 'task-replatform-legacy-monolith',
    variantId: 'task-replatform-legacy-monolith-skill-set-medium',
    variantGroupId: 'medium-interference',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'complex',
    contextSetKind: 'skill-set',
    interferenceLevel: 'medium',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/cross-domain',
        sourceId: 'trap_fullstack_deploy_order',
        kind: 'trap',
        path: 'evals/fixtures/traps/cross-domain/trap_fullstack_deploy_order.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/infra',
        sourceId: 'trap_helm_chart_drift',
        kind: 'trap',
        path: 'evals/fixtures/traps/infra/trap_helm_chart_drift.json',
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-replatform-legacy-monolith',
    goldenPath: {
      requiredSteps: [
        'decompose monolith services',
        'design API contracts',
        'migrate data stores',
        'deploy service mesh',
        'set up observability',
        'configure feature toggles',
        'shift traffic incrementally',
        'validate rollback readiness',
        'complete team handoff',
      ],
      keyActions: [
        'decompose monolith services',
        'migrate data stores',
        'shift traffic incrementally',
        'complete team handoff',
      ],
      allowedAlternativeActions: ['review domain-driven design boundaries'],
      forbiddenActions: ['big-bang migration', 'skip observability setup'],
      stepWeights: {
        'decompose monolith services': 0.12,
        'design API contracts': 0.1,
        'migrate data stores': 0.15,
        'deploy service mesh': 0.1,
        'set up observability': 0.1,
        'configure feature toggles': 0.1,
        'shift traffic incrementally': 0.13,
        'validate rollback readiness': 0.1,
        'complete team handoff': 0.1,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required replatforming sequence under medium-interference context.',
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
      finalAnswer:
        'Replatform the legacy monolith by decomposing services, migrating data, deploying the mesh, and shifting traffic incrementally with rollback readiness.',
      successCriteria: [
        'monolith decomposed',
        'data migrated',
        'traffic shifted',
        'rollback ready',
      ],
    },
    tags: [
      'smoke',
      'replatforming',
      'composite-coordination',
      'medium-interference',
      'skill-set',
      'complex-task',
    ],
  },
  {
    schemaVersion: 1,
    taskId: 'task-replatform-legacy-monolith',
    variantId: 'task-replatform-legacy-monolith-skill-set-high',
    variantGroupId: 'high-interference',
    tier: 'smoke',
    taskType: 'composite',
    taskComplexity: 'complex',
    contextSetKind: 'skill-set',
    interferenceLevel: 'high',
    interferenceSources: [
      {
        sourcePool: 'evals/fixtures/traps/backend',
        sourceId: 'trap_connection_pool_exhaustion',
        kind: 'trap',
        path: 'evals/fixtures/traps/backend/trap_connection_pool_exhaustion.json',
      },
      {
        sourcePool: 'evals/fixtures/traps/backend',
        sourceId: 'trap_transaction_deadlock',
        kind: 'trap',
        path: 'evals/fixtures/traps/backend/trap_transaction_deadlock.json',
      },
    ],
    promptTemplateId: 'default-agent-planning',
    scenarioId: 'scenario-replatform-legacy-monolith',
    goldenPath: {
      requiredSteps: [
        'decompose monolith services',
        'design API contracts',
        'migrate data stores',
        'deploy service mesh',
        'set up observability',
        'configure feature toggles',
        'shift traffic incrementally',
        'validate rollback readiness',
        'complete team handoff',
      ],
      keyActions: [
        'decompose monolith services',
        'migrate data stores',
        'shift traffic incrementally',
        'complete team handoff',
      ],
      allowedAlternativeActions: ['review domain-driven design boundaries'],
      forbiddenActions: ['big-bang migration', 'skip observability setup'],
      stepWeights: {
        'decompose monolith services': 0.12,
        'design API contracts': 0.1,
        'migrate data stores': 0.15,
        'deploy service mesh': 0.1,
        'set up observability': 0.1,
        'configure feature toggles': 0.1,
        'shift traffic incrementally': 0.13,
        'validate rollback readiness': 0.1,
        'complete team handoff': 0.1,
      },
    },
    judgeRubric: {
      dimensions: [
        {
          id: 'path-correctness',
          label: 'Path correctness',
          weight: 0.6,
          guidance: 'Uses the required replatforming sequence under high-interference context.',
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
      finalAnswer:
        'Replatform the legacy monolith by decomposing services, migrating data, deploying the mesh, and shifting traffic incrementally with rollback readiness.',
      successCriteria: [
        'monolith decomposed',
        'data migrated',
        'traffic shifted',
        'rollback ready',
      ],
    },
    tags: [
      'smoke',
      'replatforming',
      'composite-coordination',
      'high-interference',
      'skill-set',
      'complex-task',
    ],
  },
];
