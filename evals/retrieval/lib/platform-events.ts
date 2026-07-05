import type {
  EvalPlatformEvent,
  RetrievalEvalCase,
  RetrievalEvalTier,
} from '@trapmap/contracts/evals';

import type {
  RetrievalEvalFailureRecord,
  RetrievalEvalReport,
} from '../../../packages/contracts/src/domain/evals/report.js';
import { getRetrievalEvaluationCases, getRetrievalScenarioIds } from './runner-api.js';

export interface BuildRetrievalPlatformEventsInput {
  suiteRunId: string;
  baseTags: string[];
  report: RetrievalEvalReport;
}

interface RetrievalPlatformEventDeps {
  loadCases(
    tier: RetrievalEvalTier,
    endpoint?: RetrievalEvalCase['endpoint'],
  ): RetrievalEvalCase[];
  loadScenarioIds(
    tier: RetrievalEvalTier,
    endpoint?: RetrievalEvalCase['endpoint'],
  ): string[];
}

const defaultDeps: RetrievalPlatformEventDeps = {
  loadCases: getRetrievalEvaluationCases,
  loadScenarioIds: getRetrievalScenarioIds,
};

function deriveStartedAt(timestamp: string, durationMs: number): string {
  return new Date(new Date(timestamp).getTime() - durationMs).toISOString();
}

function getEventTags(baseTags: string[], caseTags: string[]): string[] {
  return [...new Set([...baseTags, ...caseTags])];
}

function groupRetrievalFailuresByCase(
  failures: RetrievalEvalFailureRecord[],
): Map<string, RetrievalEvalFailureRecord[]> {
  const grouped = new Map<string, RetrievalEvalFailureRecord[]>();

  for (const failure of failures) {
    const existing = grouped.get(failure.caseId) ?? [];
    existing.push(failure);
    grouped.set(failure.caseId, existing);
  }

  return grouped;
}

function buildRetrievalScoreEvents(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: RetrievalEvalCase;
  caseResult: RetrievalEvalReport['cases'][number];
  tags: string[];
}): EvalPlatformEvent[] {
  const { suiteRunId, timestamp, caseDefinition, caseResult, tags } = params;

  return [
    {
      family: 'EvalScoreRecorded',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: { scoreId: 'hitAt1', score: caseResult.hitAt1, source: 'case.hitAt1' },
    },
    {
      family: 'EvalScoreRecorded',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: { scoreId: 'hitAt5', score: caseResult.hitAt5, source: 'case.hitAt5' },
    },
    {
      family: 'EvalScoreRecorded',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: { scoreId: 'hitAt10', score: caseResult.hitAt10, source: 'case.hitAt10' },
    },
    {
      family: 'EvalScoreRecorded',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: { scoreId: 'mrr', score: caseResult.mrr, source: 'case.mrr' },
    },
    {
      family: 'EvalScoreRecorded',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: { scoreId: 'ndcg', score: caseResult.ndcg, source: 'case.ndcg' },
    },
    {
      family: 'EvalScoreRecorded',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: { scoreId: 'recallAt10', score: caseResult.recallAt10, source: 'case.recallAt10' },
    },
  ];
}

function buildRetrievalAssertionEvent(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: RetrievalEvalCase;
  caseResult: RetrievalEvalReport['cases'][number];
  tags: string[];
  assertionId: 'outcome' | 'governance' | 'shape' | 'graph-plan';
  passed: boolean;
  source:
    | 'case.outcomeMatch'
    | 'case.governancePassed'
    | 'case.selectedMode'
    | 'case.routingReason'
    | 'case.fallbackApplied'
    | 'case.passed';
  reason?: string;
}): EvalPlatformEvent {
  const {
    suiteRunId,
    timestamp,
    caseDefinition,
    caseResult,
    tags,
    assertionId,
    passed,
    source,
    reason,
  } = params;

  return {
    family: 'EvalAssertionRecorded',
    suite: 'retrieval',
    tier: caseResult.tier,
    runId: suiteRunId,
    caseId: caseResult.caseId,
    scenarioId: caseDefinition.scenarioId,
    timestamp,
    tags,
    payload: {
      assertionId,
      passed,
      source,
      ...(reason ? { reason } : {}),
    },
  };
}

function buildRetrievalCasePlatformEvents(params: {
  suiteRunId: string;
  startedAt: string;
  finishedAt: string;
  baseTags: string[];
  report: RetrievalEvalReport;
  caseMap: Map<string, RetrievalEvalCase>;
  failuresByCase: Map<string, RetrievalEvalFailureRecord[]>;
}): EvalPlatformEvent[] {
  const { suiteRunId, startedAt, finishedAt, baseTags, report, caseMap, failuresByCase } = params;
  const events: EvalPlatformEvent[] = [];

  for (const caseResult of report.cases) {
    const caseDefinition = caseMap.get(caseResult.caseId);
    if (!caseDefinition) {
      continue;
    }

    const tags = getEventTags(baseTags, caseDefinition.tags);
    const caseFailures = failuresByCase.get(caseResult.caseId) ?? [];
    const shapeFailures = caseFailures.filter((failure) => failure.kind === 'shape-mismatch');

    events.push({
      family: 'EvalCaseStarted',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp: startedAt,
      tags,
      payload: {
        case: caseDefinition,
      },
    });
    events.push({
      family: 'EvalCaseFinished',
      suite: 'retrieval',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp: finishedAt,
      tags,
      payload: {
        result: caseResult,
      },
    });
    events.push(
      ...buildRetrievalScoreEvents({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
      }),
      buildRetrievalAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'outcome',
        passed: caseResult.outcomeMatch,
        source: 'case.outcomeMatch',
      }),
      buildRetrievalAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'governance',
        passed: caseResult.governancePassed,
        source: 'case.governancePassed',
      }),
    );

    if (caseDefinition.endpoint === '/v3/retrieval/search') {
      events.push(
        buildRetrievalAssertionEvent({
          suiteRunId,
          timestamp: finishedAt,
          caseDefinition,
          caseResult,
          tags,
          assertionId: 'graph-plan',
          passed: caseResult.passed,
          source: 'case.passed',
          reason:
            !caseResult.passed
              ? caseFailures.map((failure) => failure.description).join('; ') || undefined
              : undefined,
        }),
      );
      continue;
    }

    events.push(
      buildRetrievalAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'shape',
        passed: shapeFailures.length === 0,
        source: 'case.passed',
        reason: shapeFailures.map((failure) => failure.description).join('; ') || undefined,
      }),
    );
  }

  return events;
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
  const failuresByCase = groupRetrievalFailuresByCase(report.failures);

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
