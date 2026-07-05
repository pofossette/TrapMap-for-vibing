import type {
  EvalPlatformEvent,
  SummaryEvalCase,
  SummaryEvalTier,
} from '@trapmap/contracts/evals';

import type {
  SummaryEvalFailureRecord,
  SummaryEvalReport,
} from '../../../packages/contracts/src/domain/evals/report.js';
import { getSummaryEvaluationCases, getSummaryScenarioIds } from './runner-api.js';

export interface BuildSummaryPlatformEventsInput {
  suiteRunId: string;
  baseTags: string[];
  report: SummaryEvalReport;
}

interface SummaryPlatformEventDeps {
  loadCases(tier: SummaryEvalTier, endpoint?: SummaryEvalCase['endpoint']): SummaryEvalCase[];
  loadScenarioIds(tier: SummaryEvalTier, endpoint?: SummaryEvalCase['endpoint']): string[];
}

const defaultDeps: SummaryPlatformEventDeps = {
  loadCases: getSummaryEvaluationCases,
  loadScenarioIds: getSummaryScenarioIds,
};

function deriveStartedAt(timestamp: string, durationMs: number): string {
  return new Date(new Date(timestamp).getTime() - durationMs).toISOString();
}

function getEventTags(baseTags: string[], caseTags: string[]): string[] {
  return [...new Set([...baseTags, ...caseTags])];
}

function groupSummaryFailuresByCase(
  failures: SummaryEvalFailureRecord[],
): Map<string, SummaryEvalFailureRecord[]> {
  const grouped = new Map<string, SummaryEvalFailureRecord[]>();

  for (const failure of failures) {
    const existing = grouped.get(failure.caseId) ?? [];
    existing.push(failure);
    grouped.set(failure.caseId, existing);
  }

  return grouped;
}

function buildSummaryScoreEvents(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: SummaryEvalCase;
  caseResult: SummaryEvalReport['cases'][number];
  tags: string[];
}): EvalPlatformEvent[] {
  const { suiteRunId, timestamp, caseDefinition, caseResult, tags } = params;

  return [
    {
      family: 'EvalScoreRecorded',
      suite: 'summary',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: {
        scoreId: 'groundednessScore',
        score: caseResult.groundednessScore,
        source: 'case.groundednessScore',
      },
    },
    {
      family: 'EvalScoreRecorded',
      suite: 'summary',
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId: caseResult.caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
      payload: {
        scoreId: 'coverageScore',
        score: caseResult.coverageScore,
        source: 'case.coverageScore',
      },
    },
  ];
}

function buildSummaryAssertionEvent(params: {
  suiteRunId: string;
  timestamp: string;
  caseDefinition: SummaryEvalCase;
  caseResult: SummaryEvalReport['cases'][number];
  tags: string[];
  assertionId: 'summary-present' | 'groundedness' | 'coverage' | 'forbidden-claims';
  passed: boolean;
  source:
    | 'case.claimsTotal'
    | 'case.groundednessScore'
    | 'case.coverageScore'
    | 'case.forbiddenClaimsFound';
  expected?: unknown;
  actual?: unknown;
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
    expected,
    actual,
    reason,
  } = params;

  return {
    family: 'EvalAssertionRecorded',
    suite: 'summary',
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
      ...(expected !== undefined ? { expected } : {}),
      ...(actual !== undefined ? { actual } : {}),
      ...(reason ? { reason } : {}),
    },
  };
}

function buildSummaryCasePlatformEvents(params: {
  suiteRunId: string;
  startedAt: string;
  finishedAt: string;
  baseTags: string[];
  report: SummaryEvalReport;
  caseMap: Map<string, SummaryEvalCase>;
  failuresByCase: Map<string, SummaryEvalFailureRecord[]>;
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
    const expectedSummary = caseDefinition.expected.expectSummary ?? true;
    const actualSummary = caseResult.claimsTotal > 0;
    const groundednessReason =
      caseFailures.find((failure) => failure.kind === 'groundedness-below-threshold')
        ?.description ?? undefined;
    const coverageReason =
      caseFailures.find((failure) => failure.kind === 'coverage-below-threshold')?.description ??
      undefined;
    const summaryPresentReason =
      caseFailures.find((failure) => failure.kind === 'missing-summary')?.description ?? undefined;
    const forbiddenReason =
      caseFailures
        .filter((failure) => failure.kind === 'forbidden-claim-found')
        .map((failure) => failure.description)
        .join('; ') || undefined;

    events.push({
      family: 'EvalCaseStarted',
      suite: 'summary',
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
      suite: 'summary',
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
      ...buildSummaryScoreEvents({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
      }),
      buildSummaryAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'summary-present',
        passed: expectedSummary === actualSummary,
        source: 'case.claimsTotal',
        expected: expectedSummary,
        actual: actualSummary,
        reason: summaryPresentReason,
      }),
      buildSummaryAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'groundedness',
        passed: caseResult.groundednessScore >= (caseDefinition.expected.minGroundedness ?? 0.8),
        source: 'case.groundednessScore',
        expected: caseDefinition.expected.minGroundedness ?? 0.8,
        actual: caseResult.groundednessScore,
        reason: groundednessReason,
      }),
      buildSummaryAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'coverage',
        passed: caseResult.coverageScore >= (caseDefinition.expected.minCoverage ?? 0.7),
        source: 'case.coverageScore',
        expected: caseDefinition.expected.minCoverage ?? 0.7,
        actual: caseResult.coverageScore,
        reason: coverageReason,
      }),
      buildSummaryAssertionEvent({
        suiteRunId,
        timestamp: finishedAt,
        caseDefinition,
        caseResult,
        tags,
        assertionId: 'forbidden-claims',
        passed: caseResult.forbiddenClaimsFound.length === 0,
        source: 'case.forbiddenClaimsFound',
        expected: [],
        actual: caseResult.forbiddenClaimsFound,
        reason: forbiddenReason,
      }),
    );
  }

  return events;
}

export async function buildSummaryPlatformEvents(
  input: BuildSummaryPlatformEventsInput,
): Promise<EvalPlatformEvent[]> {
  const { suiteRunId, baseTags, report } = input;
  const startedAt = deriveStartedAt(report.meta.timestamp, report.meta.durationMs);
  const scenarioIds = defaultDeps.loadScenarioIds(report.meta.options.tier, report.meta.options.endpoint);
  const summaryCases = defaultDeps.loadCases(report.meta.options.tier, report.meta.options.endpoint);
  const caseMap = new Map(summaryCases.map((case_) => [case_.caseId, case_]));
  const failuresByCase = groupSummaryFailuresByCase(report.failures);

  return [
    {
      family: 'EvalRunStarted',
      suite: 'summary',
      tier: report.meta.options.tier,
      runId: suiteRunId,
      caseId: null,
      scenarioId: null,
      timestamp: startedAt,
      tags: baseTags,
      payload: {
        reportMeta: {
          schemaVersion: report.meta.schemaVersion,
          timestamp: report.meta.timestamp,
          llmProvider: report.meta.llmProvider,
          options: report.meta.options,
        },
        runScope: {
          tier: report.meta.options.tier,
          dryRun: report.meta.options.dryRun,
          allowEmpty: report.meta.options.allowEmpty,
          endpoint: report.meta.options.endpoint,
          verbose: report.meta.options.verbose > 0,
          provider: report.meta.llmProvider,
          caseCount: report.summary.totalCases,
          scenarioIds,
        },
      },
    },
    ...buildSummaryCasePlatformEvents({
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
      suite: 'summary',
      tier: report.meta.options.tier,
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
          failures: report.failures,
        },
      },
    },
  ];
}
