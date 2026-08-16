import type { EvalPlatformEvent, RetrievalEvalCase, RetrievalEvalTier } from '../../types/index.js';

import type { RetrievalEvalFailureRecord, RetrievalEvalReport } from '../../types/report.js';
import {
  buildCaseAssertionEvent,
  buildCaseLifecycleEvents,
  buildCaseScoreEvents,
  collectCaseEvents,
  deriveStartedAt,
  groupFailuresByCase,
} from '../../lib/platform-events.js';
import { getRetrievalEvaluationCases, getRetrievalScenarioIds } from './runner-api.js';

export interface BuildRetrievalPlatformEventsInput {
  suiteRunId: string;
  baseTags: string[];
  report: RetrievalEvalReport;
}

interface RetrievalPlatformEventDeps {
  loadCases(tier: RetrievalEvalTier, endpoint?: RetrievalEvalCase['endpoint']): RetrievalEvalCase[];
  loadScenarioIds(tier: RetrievalEvalTier, endpoint?: RetrievalEvalCase['endpoint']): string[];
}

const defaultDeps: RetrievalPlatformEventDeps = {
  loadCases: getRetrievalEvaluationCases,
  loadScenarioIds: getRetrievalScenarioIds,
};

function buildRetrievalScoreEvents(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: RetrievalEvalCase;
  caseResult: RetrievalEvalReport['cases'][number];
  tags: string[];
}) {
  const { suiteRunId, timestamp, caseDefinition, caseResult, tags } = params;

  return buildCaseScoreEvents(
    {
      suite: 'retrieval',
      suiteRunId,
      timestamp,
      caseResult,
      caseDefinition,
      caseId: caseResult.caseId,
      tags,
    },
    [
      { scoreId: 'hitAt1', score: caseResult.hitAt1, source: 'case.hitAt1' },
      { scoreId: 'hitAt5', score: caseResult.hitAt5, source: 'case.hitAt5' },
      { scoreId: 'hitAt10', score: caseResult.hitAt10, source: 'case.hitAt10' },
      { scoreId: 'mrr', score: caseResult.mrr, source: 'case.mrr' },
      { scoreId: 'ndcg', score: caseResult.ndcg, source: 'case.ndcg' },
      { scoreId: 'recallAt10', score: caseResult.recallAt10, source: 'case.recallAt10' },
    ],
  );
}

function buildRetrievalCasePlatformEvents(params: {
  suiteRunId: string;
  startedAt: string;
  finishedAt: string;
  baseTags: string[];
  report: RetrievalEvalReport;
  caseMap: Map<string, RetrievalEvalCase>;
  failuresByCase: Map<string, RetrievalEvalFailureRecord[]>;
}) {
  const { suiteRunId, startedAt, finishedAt, baseTags, report, caseMap, failuresByCase } = params;

  return collectCaseEvents(
    report,
    caseMap,
    failuresByCase,
    baseTags,
    ({ caseResult, caseDefinition, tags, caseFailures }) => {
      const shapeFailures = caseFailures.filter((failure) => failure.kind === 'shape-mismatch');
      const graphPlanFailures = caseFailures.filter(
        (failure) => failure.kind === 'graph-plan-mismatch',
      );
      const caseParams = {
        suite: 'retrieval' as const,
        suiteRunId,
        timestamp: finishedAt,
        caseResult,
        caseDefinition,
        caseId: caseResult.caseId,
        tags,
      };

      const assertionEvents =
        caseDefinition.endpoint === '/v3/retrieval/search'
          ? [
              buildCaseAssertionEvent({
                ...caseParams,
                assertionId: 'graph-plan',
                passed: graphPlanFailures.length === 0,
                source: 'case.passed',
                reason:
                  graphPlanFailures.map((failure) => failure.description).join('; ') || undefined,
              }),
            ]
          : [
              buildCaseAssertionEvent({
                ...caseParams,
                assertionId: 'shape',
                passed: shapeFailures.length === 0,
                source: 'case.passed',
                reason: shapeFailures.map((failure) => failure.description).join('; ') || undefined,
              }),
            ];

      return [
        ...buildCaseLifecycleEvents({
          envelope: {
            suite: 'retrieval',
            tier: caseResult.tier,
            runId: suiteRunId,
            caseId: caseResult.caseId,
            scenarioId: caseDefinition.scenarioId,
            timestamp: finishedAt,
            tags,
          },
          startedAt,
          finishedAt,
          caseDefinition,
          caseResult,
        }),
        ...buildRetrievalScoreEvents({
          suiteRunId,
          timestamp: finishedAt,
          caseDefinition,
          caseResult,
          tags,
        }),
        buildCaseAssertionEvent({
          ...caseParams,
          assertionId: 'outcome',
          passed: caseResult.outcomeMatch,
          source: 'case.outcomeMatch',
        }),
        buildCaseAssertionEvent({
          ...caseParams,
          assertionId: 'governance',
          passed: caseResult.governancePassed,
          source: 'case.governancePassed',
        }),
        ...assertionEvents,
      ];
    },
  );
}

export async function buildRetrievalPlatformEvents(
  input: BuildRetrievalPlatformEventsInput,
  deps: RetrievalPlatformEventDeps = defaultDeps,
): Promise<EvalPlatformEvent[]> {
  const { suiteRunId, baseTags, report } = input;
  const tier = report.meta.options.tier;
  const endpoint = report.meta.options.endpoint;
  const startedAt = deriveStartedAt(report.meta.timestamp, report.meta.durationMs);
  const scenarioIds = deps.loadScenarioIds(tier, endpoint);
  const retrievalCases = deps.loadCases(tier, endpoint);
  const caseMap = new Map(retrievalCases.map((case_) => [case_.caseId, case_]));
  const failuresByCase = groupFailuresByCase(report.failures);

  return [
    {
      family: 'EvalRunStarted',
      suite: 'retrieval',
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
          options: report.meta.options,
          baselinePath: report.meta.baselinePath,
          isBaselineWrite: report.meta.isBaselineWrite,
        },
        runScope: {
          tier,
          dryRun: report.meta.options.dryRun,
          allowEmpty: report.meta.options.allowEmpty,
          endpoint,
          verbose: report.meta.options.verbose > 0,
          caseCount: report.summary.totalCases,
          scenarioIds,
        },
      },
    },
    ...buildRetrievalCasePlatformEvents({
      suiteRunId,
      startedAt,
      finishedAt: report.meta.timestamp,
      baseTags,
      report,
      caseMap,
      failuresByCase,
    }),
    {
      family: 'EvalRunFinished',
      suite: 'retrieval',
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
          slices: report.slices,
          cohorts: report.cohorts,
          modeComparisons: report.modeComparisons,
          routingDistribution: report.routingDistribution,
          failures: report.failures,
          warnings: report.warnings,
        },
      },
    },
  ];
}
