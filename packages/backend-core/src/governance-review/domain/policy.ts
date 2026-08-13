/**
 * Governance-review bounded context — policy rules.
 *
 * Pure feedback / remediation / review-queue decision rules with zero
 * framework / DB / I/O imports (contracts types and pure helpers only).
 * The service application layer renders these into orchestration; the
 * PostgreSQL owner uses them for remediation projections.
 */

import { BADCASE_TAXONOMY_VALUES, normalizeBadcaseTaxonomy } from '@trapmap/contracts';
import type { FeedbackRemediationState, LifecycleTriggerRule } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Feedback / remediation policy
// ---------------------------------------------------------------------------

/** Minimum number of active feedback records that escalates an entry into remediation. */
export const FEEDBACK_REMEDIATION_THRESHOLD = 10;

/** Canonical failure classification order used for summary counts. */
export const FAILURE_CLASSIFICATIONS: readonly string[] = BADCASE_TAXONOMY_VALUES;

/** Status a freshly submitted feedback record is born with. */
export const INITIAL_FEEDBACK_STATUS = 'new' as const;

/** Normalize a raw entry type to the feedback record vocabulary. */
export function normalizeFeedbackEntryType(entryType: unknown): 'trap' | 'skill' {
  return entryType === 'skill' ? 'skill' : 'trap';
}

/** Statuses that keep a feedback record active (not resolved / dismissed). */
export function isActiveFeedbackStatus(status: string): boolean {
  return status === 'new' || status === 'triaged';
}

/** Whether a feedback record is a terminal (resolved / dismissed) state. */
export function isTerminalFeedbackStatus(status: string): boolean {
  return status === 'resolved' || status === 'dismissed';
}

/** Age of a feedback record in (possibly fractional) days. */
export function ageDays(submittedAt: string, now: Date): number {
  return (now.getTime() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
}

/** Active feedback records for an entry: not resolved / dismissed. */
export function activeFeedback<T extends { entryId: string; status: string }>(
  records: readonly T[],
  entryId: string,
): T[] {
  return records.filter(
    (record) => record.entryId === entryId && isActiveFeedbackStatus(record.status),
  );
}

/**
 * Derive the shared remediation state for an entry from its feedback history.
 * Returns null when the entry has not crossed the remediation threshold.
 */
export function remediationState(
  records: ReadonlyArray<{
    id: string;
    entryId: string;
    status: string;
    submittedAt: string;
    remediationStatus?: string | null | undefined;
    remediationOpenedAt?: string | null | undefined;
    remediationOpenedByUserId?: string | null | undefined;
    remediationResolvedAt?: string | null | undefined;
    remediationResolvedByUserId?: string | null | undefined;
  }>,
  entryId: string,
): FeedbackRemediationState | null {
  const active = activeFeedback(records, entryId);
  if (active.length < FEEDBACK_REMEDIATION_THRESHOLD) return null;
  const ordered = [...active].sort((left, right) =>
    left.submittedAt.localeCompare(right.submittedAt),
  );
  const status = ordered.some((record) => record.remediationStatus === 'ready-to-reindex')
    ? 'ready-to-reindex'
    : ordered.some((record) => record.remediationStatus === 'in-remediation')
      ? 'in-remediation'
      : 'pending-human-review';
  const resolvedAt = ordered
    .map((record) => record.remediationResolvedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1);
  const resolvedByUserId = ordered
    .map((record) => record.remediationResolvedByUserId)
    .filter((value): value is string => typeof value === 'string')
    .at(-1);
  const first = ordered[0]!;
  return {
    status,
    triggeredByFeedbackCount: ordered.length,
    threshold: FEEDBACK_REMEDIATION_THRESHOLD,
    suppressedFromRetrieval: true,
    suppressedFromIndex: true,
    activeFeedbackIds: ordered.map((record) => record.id),
    openedAt: (first.remediationOpenedAt as string | undefined) ?? first.submittedAt,
    openedByUserId: (first.remediationOpenedByUserId as string | undefined) ?? null,
    resolvedAt: resolvedAt ?? null,
    resolvedByUserId: resolvedByUserId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Failure classification summary
// ---------------------------------------------------------------------------

export interface FailureClassificationSummary {
  totalClassified: number;
  dominantClassification: string | null;
  counts: Array<{ classification: string; count: number }>;
}

/** Aggregate failure classifications into counts plus a dominant class. */
export function failureClassificationSummary(
  records: ReadonlyArray<{ failureClassification?: string | null | undefined }>,
): FailureClassificationSummary {
  const counts = FAILURE_CLASSIFICATIONS.map((classification) => ({ classification, count: 0 }));
  for (const record of records) {
    const classification = normalizeBadcaseTaxonomy(record.failureClassification);
    const count = counts.find((item) => item.classification === classification);
    if (count) count.count += 1;
  }
  const dominant = [...counts]
    .sort((left, right) => right.count - left.count)
    .find((item) => item.count > 0)?.classification;
  return {
    totalClassified: counts.reduce((total, item) => total + item.count, 0),
    dominantClassification: dominant ?? null,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Batch command policy
// ---------------------------------------------------------------------------

export type FeedbackBatchAction = 'resolve' | 'dismiss' | 'triage' | 'transition';

/**
 * Eligibility of a single feedback record for a batch action.
 * Resolve / dismiss apply to any existing non-terminal record; triage only
 * applies to new records; transition requires an explicit transition target.
 */
export function batchActionEligibility(
  action: FeedbackBatchAction,
  record: { status: string } | null,
  transitionTarget: string | undefined,
): { eligible: boolean; reason: string | null } {
  if (!record) {
    return { eligible: false, reason: 'Feedback not found' };
  }
  if (isTerminalFeedbackStatus(record.status)) {
    return { eligible: false, reason: `Feedback already ${record.status}` };
  }
  switch (action) {
    case 'resolve':
    case 'dismiss':
      return { eligible: true, reason: null };
    case 'triage':
      if (record.status !== 'new') {
        return { eligible: false, reason: 'Only new feedback can be triaged' };
      }
      return { eligible: true, reason: null };
    case 'transition':
      if (transitionTarget === undefined) {
        return { eligible: false, reason: 'transitionTarget required for transition action' };
      }
      return { eligible: true, reason: null };
  }
}

/** Persisted field updates produced by applying a batch action. */
export function batchActionUpdates(
  action: FeedbackBatchAction,
  transitionTarget: string | undefined,
  appliedAt: string,
  actorId: string,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  switch (action) {
    case 'resolve':
      updates.status = 'resolved';
      updates.resolvedAt = appliedAt;
      updates.resolvedByUserId = actorId;
      break;
    case 'dismiss':
      updates.status = 'dismissed';
      break;
    case 'triage':
      updates.status = 'triaged';
      break;
    case 'transition':
      updates.triggeredTransition = transitionTarget ?? null;
      break;
  }
  return updates;
}

// ---------------------------------------------------------------------------
// Quality score
// ---------------------------------------------------------------------------

/** Clamped 0..1 quality score degraded by unresolved / incorrect / outdated feedback. */
export function qualityScore(
  unresolvedFeedback: number,
  incorrectReports: number,
  outdatedReports: number,
): number {
  return Math.max(
    0,
    Math.min(
      1,
      Math.round(
        (1 - unresolvedFeedback * 0.1 - incorrectReports * 0.05 - outdatedReports * 0.05) * 100,
      ) / 100,
    ),
  );
}

// ---------------------------------------------------------------------------
// Lifecycle trigger rules
// ---------------------------------------------------------------------------

/** Whether a feedback record counts towards a lifecycle trigger rule. */
export function matchesLifecycleTriggerRule(
  record: { status: string; problemType: string; submittedAt: string },
  rule: LifecycleTriggerRule,
  now: Date,
): boolean {
  if (record.status === 'dismissed' || record.problemType !== rule.problemType) {
    return false;
  }
  return ageDays(record.submittedAt, now) <= rule.timeWindowDays;
}

/** Human-readable reason for a triggered lifecycle transition. */
export function lifecycleTriggerReason(
  count: number,
  rule: Pick<LifecycleTriggerRule, 'problemType' | 'timeWindowDays'>,
): string {
  return `${count} '${rule.problemType}' feedback in last ${rule.timeWindowDays} days`;
}

// ---------------------------------------------------------------------------
// Review-queue eligibility
// ---------------------------------------------------------------------------

export interface ReviewQueueProjectionAuth {
  subjectType: 'user' | 'system-admin';
  activeTeamId: string | null;
  securityLevel: number;
}

export type ReviewQueueEntry = {
  teamId: string | null;
  requiredLevel: number;
  lifecycleState: string;
};

/**
 * Whether an entry is visible in the review queue for the given auth context:
 * team-gated for non-system-admins and only entries above the reviewer's
 * security level. An optional lifecycle status narrows the result.
 */
export function isReviewQueueEntryVisible(
  entry: ReviewQueueEntry,
  auth: ReviewQueueProjectionAuth,
  status?: string,
): boolean {
  if (entry.teamId && auth.subjectType !== 'system-admin' && auth.activeTeamId !== entry.teamId) {
    return false;
  }
  if (auth.subjectType !== 'system-admin' && auth.securityLevel <= entry.requiredLevel) {
    return false;
  }
  return status ? entry.lifecycleState === status : true;
}

export function filterReviewQueueEntries<T extends ReviewQueueEntry>(
  entries: readonly T[],
  input: { auth: ReviewQueueProjectionAuth; status?: string },
): T[] {
  return entries.filter((entry) => isReviewQueueEntryVisible(entry, input.auth, input.status));
}
