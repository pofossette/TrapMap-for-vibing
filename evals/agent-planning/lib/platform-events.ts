import type {
  AgentPlanningEvalCase,
  AgentPlanningEvalReport,
  AgentPlanningEvalTier,
  EvalPlatformEvent,
} from '@trapmap/contracts/evals';

import {
  buildAssertionEvent,
  buildCaseLifecycleEvents,
  buildCaseScoreEvents,
  deriveStartedAt,
  getEventTags,
} from '../../lib/platform-events.js';
import { getAgentPlanningEvaluationCases, getAgentPlanningScenarioIds } from './runner-api.js';

export interface BuildAgentPlanningPlatformEventsInput {
  suiteRunId: string;
  baseTags: string[];
  report: AgentPlanningEvalReport;
}

export interface AgentPlanningPlatformEventDeps {
  loadCases(tier: AgentPlanningEvalTier): AgentPlanningEvalCase[];
  loadScenarioIds(tier: AgentPlanningEvalTier): string[];
}

const defaultDeps: AgentPlanningPlatformEventDeps = {
  loadCases: getAgentPlanningEvaluationCases,
  loadScenarioIds: getAgentPlanningScenarioIds,
};

function buildAgentPlanningScoreEvents(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: AgentPlanningEvalCase;
  caseResult: AgentPlanningEvalReport['cases'][number];
  tags: string[];
}) {
  const { suiteRunId, timestamp, caseDefinition, caseResult, tags } = params;
  const caseParams = {
    suite: 'agent-planning' as const,
    suiteRunId,
    timestamp,
    caseResult,
    caseDefinition,
    caseId: caseResult.variantId,
    tags,
  };

  return [
    ...buildCaseScoreEvents(caseParams, [
      { scoreId: 'totalScore', score: caseResult.totalScore, source: 'case.totalScore' },
      { scoreId: 'pathScore', score: caseResult.pathScore, source: 'case.pathScore' },
      {
        scoreId: 'finalAnswerScore',
        score: caseResult.finalAnswerScore,
        source: 'case.finalAnswerScore',
      },
    ]),
    ...buildCaseScoreEvents(
      caseParams,
      caseResult.judge.dimensionScores.map((dimensionScore) => ({
        scoreId: `dimension:${dimensionScore.dimensionId}`,
        score: dimensionScore.score,
        source: 'case.judge.dimensionScores[*].score' as const,
        rationale: dimensionScore.rationale,
      })),
    ),
  ];
}

function buildAgentPlanningAssertionEvent(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: AgentPlanningEvalCase;
  caseResult: AgentPlanningEvalReport['cases'][number];
  tags: string[];
  assertionId:
    | 'precheck.required-steps'
    | 'precheck.key-actions'
    | 'precheck.forbidden-actions'
    | 'precheck.empty-output'
    | 'precheck.parse-failed'
    | 'judge.matched-key-actions'
    | 'judge.missing-key-actions'
    | 'judge.forbidden-action-hits';
  passed: boolean;
  source:
    | 'case.deterministicPrecheck.missingRequiredSteps'
    | 'case.deterministicPrecheck.missingKeyActions'
    | 'case.deterministicPrecheck.forbiddenActionHits'
    | 'case.deterministicPrecheck.emptyOutput'
    | 'case.deterministicPrecheck.parseFailed'
    | 'case.judge.matchedKeyActions'
    | 'case.judge.missingKeyActions'
    | 'case.judge.forbiddenActionHits';
  expected?: unknown;
  actual?: unknown;
}) {
  const { suiteRunId, timestamp, caseDefinition, caseResult, tags } = params;

  return buildAssertionEvent({
    envelope: {
      suite: 'agent-planning',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.variantId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
    },
    assertionId: params.assertionId,
    passed: params.passed,
    source: params.source,
    expected: params.expected,
    actual: params.actual,
  });
}

function buildAgentPlanningTraceEvents(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: AgentPlanningEvalCase;
  caseResult: AgentPlanningEvalReport['cases'][number];
  tags: string[];
}): EvalPlatformEvent[] {
  const { suiteRunId, timestamp, caseDefinition, caseResult, tags } = params;

  return [
    {
      family: 'EvalTraceStepRecorded',
      suite: 'agent-planning',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.variantId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: {
        stepIndex: 0,
        kind: 'actor-output',
        text: caseResult.actorOutput,
        source: 'case.actorOutput',
      },
    },
    ...caseResult.normalizedPlan.map((step, index) => ({
      family: 'EvalTraceStepRecorded' as const,
      suite: 'agent-planning' as const,
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.variantId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: {
        stepIndex: index,
        kind: 'normalized-plan-step' as const,
        text: step,
        source: 'case.normalizedPlan[*]' as const,
      },
    })),
  ];
}

function buildAgentPlanningCasePlatformEvents(params: {
  suiteRunId: string;
  startedAt: string;
  finishedAt: string;
  baseTags: string[];
  report: AgentPlanningEvalReport;
  caseMap: Map<string, AgentPlanningEvalCase>;
}) {
  const { suiteRunId, startedAt, finishedAt, baseTags, report, caseMap } = params;
  const events: EvalPlatformEvent[] = [];

  for (const caseResult of report.cases) {
    const caseDefinition = caseMap.get(`${caseResult.taskId}:${caseResult.variantId}`);
    if (!caseDefinition) {
      continue;
    }

    const tags = getEventTags(baseTags, caseDefinition.tags);
    events.push(
      ...buildCaseLifecycleEvents({
        envelope: {
          suite: 'agent-planning',
          tier: caseResult.tier,
          runId: suiteRunId,
          caseId: caseResult.variantId,
          scenarioId: caseDefinition.scenarioId,
          timestamp: finishedAt,
          tags,
        },
        startedAt,
        finishedAt,
        caseDefinition,
        caseResult,
        execution: {
          actorOutput: caseResult.actorOutput,
          normalizedPlan: caseResult.normalizedPlan,
        },
      }),
      ...buildAgentPlanningScoreEvents({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'precheck.required-steps',
        passed: caseResult.deterministicPrecheck.missingRequiredSteps.length === 0,
        source: 'case.deterministicPrecheck.missingRequiredSteps',
        expected: [],
        actual: caseResult.deterministicPrecheck.missingRequiredSteps,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'precheck.key-actions',
        passed: caseResult.deterministicPrecheck.missingKeyActions.length === 0,
        source: 'case.deterministicPrecheck.missingKeyActions',
        expected: [],
        actual: caseResult.deterministicPrecheck.missingKeyActions,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'precheck.forbidden-actions',
        passed: caseResult.deterministicPrecheck.forbiddenActionHits.length === 0,
        source: 'case.deterministicPrecheck.forbiddenActionHits',
        expected: [],
        actual: caseResult.deterministicPrecheck.forbiddenActionHits,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'precheck.empty-output',
        passed: !caseResult.deterministicPrecheck.emptyOutput,
        source: 'case.deterministicPrecheck.emptyOutput',
        expected: false,
        actual: caseResult.deterministicPrecheck.emptyOutput,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'precheck.parse-failed',
        passed: !caseResult.deterministicPrecheck.parseFailed,
        source: 'case.deterministicPrecheck.parseFailed',
        expected: false,
        actual: caseResult.deterministicPrecheck.parseFailed,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'judge.matched-key-actions',
        passed: caseResult.judge.matchedKeyActions.length > 0,
        source: 'case.judge.matchedKeyActions',
        expected: caseResult.judge.matchedKeyActions,
        actual: caseResult.judge.matchedKeyActions,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'judge.missing-key-actions',
        passed: caseResult.judge.missingKeyActions.length === 0,
        source: 'case.judge.missingKeyActions',
        expected: [],
        actual: caseResult.judge.missingKeyActions,
      }),
      buildAgentPlanningAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'judge.forbidden-action-hits',
        passed: caseResult.judge.forbiddenActionHits.length === 0,
        source: 'case.judge.forbiddenActionHits',
        expected: [],
        actual: caseResult.judge.forbiddenActionHits,
      }),
      ...buildAgentPlanningTraceEvents({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
      }),
    );
  }

  return events;
}

export async function buildAgentPlanningPlatformEvents(
  input: BuildAgentPlanningPlatformEventsInput,
  deps: AgentPlanningPlatformEventDeps = defaultDeps,
): Promise<EvalPlatformEvent[]> {
  const { suiteRunId, baseTags, report } = input;
  const startedAt = deriveStartedAt(report.meta.timestamp, report.meta.durationMs);
  const tier = report.meta.options.tier;
  const scenarioIds = deps.loadScenarioIds(tier);
  const caseMap = new Map(
    deps.loadCases(tier).map((case_) => [`${case_.taskId}:${case_.variantId}`, case_]),
  );

  return [
    {
      family: 'EvalRunStarted',
      suite: 'agent-planning',
      tier,
      runId: suiteRunId,
      caseId: null,
      scenarioId: null,
      timestamp: startedAt,
      tags: baseTags,
      payload: {
        reportMeta: {
          schemaVersion: report.meta.schemaVersion,
          timestamp: report.meta.timestamp,
          runner: report.meta.runner,
          options: report.meta.options,
        },
        runScope: {
          tier,
          dryRun: report.meta.options.dryRun,
          provider: report.meta.options.provider,
          promptTemplateId: report.meta.options.promptTemplateId,
          caseCount: report.summary.totalCases,
          scenarioIds,
        },
      },
    },
    ...buildAgentPlanningCasePlatformEvents({
      suiteRunId,
      startedAt,
      finishedAt: report.meta.timestamp,
      baseTags,
      report,
      caseMap,
    }),
    {
      family: 'EvalRunFinished',
      suite: 'agent-planning',
      tier,
      runId: suiteRunId,
      caseId: null,
      scenarioId: null,
      timestamp: report.meta.timestamp,
      tags: baseTags,
      payload: {
        reportMeta: report.meta,
        reportSummary: report.summary,
        reportCollections: {
          cases: report.cases,
          groups: report.groups,
          slices: report.slices,
        },
      },
    },
  ];
}
