/**
 * Shared platform-event building helpers for the eval suites.
 *
 * The retrieval, summary and agent-planning suites each publish the same
 * event families (EvalRunStarted/Finished, EvalCaseStarted/Finished,
 * EvalScoreRecorded, EvalAssertionRecorded). The envelope and lifecycle
 * construction used to be copy-pasted per suite; this module owns the shared
 * parts. Generic type parameters carry the per-suite literal types so the
 * built events stay assignable to the strict EvalPlatformEvent union without
 * runtime re-validation (reports/cases are already schema-validated upstream).
 */

import type { EvalPlatformEvent, EvalPlatformTier } from '@trapmap/contracts/evals';

export type EvalPlatformSuite = 'agent-planning' | 'retrieval' | 'summary';

export interface EvalEventEnvelope {
  suite: EvalPlatformSuite;
  tier: EvalPlatformTier;
  runId: string;
  caseId: string | null;
  scenarioId: string | null;
  timestamp: string;
  tags: string[];
}

export function deriveStartedAt(timestamp: string, durationMs: number): string {
  return new Date(new Date(timestamp).getTime() - durationMs).toISOString();
}

export function getEventTags(baseTags: string[], caseTags: string[]): string[] {
  return [...new Set([...baseTags, ...caseTags])];
}

export function groupFailuresByCase<TFailure extends { caseId: string }>(
  failures: TFailure[],
): Map<string, TFailure[]> {
  const grouped = new Map<string, TFailure[]>();

  for (const failure of failures) {
    const existing = grouped.get(failure.caseId) ?? [];
    existing.push(failure);
    grouped.set(failure.caseId, existing);
  }

  return grouped;
}

export function collectCaseEvents<
  TReport extends { cases: ReadonlyArray<{ caseId: string }> },
  TCase extends { caseId: string; tags: string[] },
  TFailure extends { caseId: string; kind: string },
>(
  report: TReport,
  caseMap: Map<string, TCase>,
  failuresByCase: Map<string, TFailure[]>,
  baseTags: string[],
  buildEvents: (context: {
    caseResult: TReport['cases'][number];
    caseDefinition: TCase;
    tags: string[];
    caseFailures: TFailure[];
  }) => EvalPlatformEvent[],
): EvalPlatformEvent[] {
  const events: EvalPlatformEvent[] = [];

  for (const caseResult of report.cases) {
    const caseDefinition = caseMap.get(caseResult.caseId);
    if (!caseDefinition) {
      continue;
    }

    const tags = getEventTags(baseTags, caseDefinition.tags);
    const caseFailures = failuresByCase.get(caseResult.caseId) ?? [];
    events.push(...buildEvents({ caseResult, caseDefinition, tags, caseFailures }));
  }

  return events;
}

export function buildScoreEvents<
  TSuite extends EvalPlatformSuite,
  TScoreId extends string,
  TSource extends string,
>(
  envelope: EvalEventEnvelope & { suite: TSuite },
  scores: Array<{ scoreId: TScoreId; score: number; source: TSource; rationale?: string }>,
) {
  return scores.map((score) => ({
    family: 'EvalScoreRecorded' as const,
    ...envelope,
    payload: score,
  }));
}

export function buildCaseScoreEvents<
  TSuite extends EvalPlatformSuite,
  TCaseResult extends { tier: EvalPlatformTier },
  TCaseDefinition extends { scenarioId: string },
  TScoreId extends string,
  TSource extends string,
>(
  params: {
    suite: TSuite;
    suiteRunId: string;
    timestamp: string;
    caseResult: TCaseResult;
    caseDefinition: TCaseDefinition;
    caseId: string;
    tags: string[];
  },
  scores: Array<{ scoreId: TScoreId; score: number; source: TSource; rationale?: string }>,
) {
  const { suite, suiteRunId, timestamp, caseResult, caseDefinition, caseId, tags } = params;
  return buildScoreEvents(
    {
      suite,
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
    },
    scores,
  );
}

export function buildAssertionEvent<
  TSuite extends EvalPlatformSuite,
  TAssertionId extends string,
  TSource extends string,
>(params: {
  envelope: EvalEventEnvelope & { suite: TSuite };
  assertionId: TAssertionId;
  passed: boolean;
  source: TSource;
  expected?: unknown | undefined;
  actual?: unknown | undefined;
  reason?: string | undefined;
}) {
  const { envelope, assertionId, passed, source } = params;

  return {
    family: 'EvalAssertionRecorded' as const,
    ...envelope,
    payload: {
      assertionId,
      passed,
      source,
      ...(params.expected !== undefined ? { expected: params.expected } : {}),
      ...(params.actual !== undefined ? { actual: params.actual } : {}),
      ...(params.reason ? { reason: params.reason } : {}),
    },
  };
}

export function buildCaseAssertionEvent<
  TSuite extends EvalPlatformSuite,
  TCaseResult extends { tier: EvalPlatformTier },
  TCaseDefinition extends { scenarioId: string },
  TAssertionId extends string,
  TSource extends string,
>(params: {
  suite: TSuite;
  suiteRunId: string;
  timestamp: string;
  caseResult: TCaseResult;
  caseDefinition: TCaseDefinition;
  caseId: string;
  tags: string[];
  assertionId: TAssertionId;
  passed: boolean;
  source: TSource;
  expected?: unknown | undefined;
  actual?: unknown | undefined;
  reason?: string | undefined;
}) {
  const { suite, suiteRunId, timestamp, caseResult, caseDefinition, caseId, tags } = params;

  return buildAssertionEvent({
    envelope: {
      suite,
      tier: caseResult.tier,
      runId: suiteRunId,
      caseId,
      scenarioId: caseDefinition.scenarioId,
      timestamp,
      tags,
    },
    assertionId: params.assertionId,
    passed: params.passed,
    source: params.source,
    expected: params.expected,
    actual: params.actual,
    reason: params.reason,
  });
}

export function buildCaseLifecycleEvents<TSuite extends EvalPlatformSuite, TCase, TResult>(params: {
  envelope: EvalEventEnvelope & { suite: TSuite };
  startedAt: string;
  finishedAt: string;
  caseDefinition: TCase;
  caseResult: TResult;
  execution?: { actorOutput: string; normalizedPlan: string[] } | undefined;
}) {
  const { envelope, startedAt, finishedAt, caseDefinition, caseResult } = params;

  return [
    {
      family: 'EvalCaseStarted' as const,
      ...envelope,
      timestamp: startedAt,
      payload: { case: caseDefinition },
    },
    {
      family: 'EvalCaseFinished' as const,
      ...envelope,
      timestamp: finishedAt,
      payload: {
        result: caseResult,
        ...(params.execution !== undefined ? { execution: params.execution } : {}),
      },
    },
  ];
}
