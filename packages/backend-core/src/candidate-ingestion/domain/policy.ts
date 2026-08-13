/**
 * Candidate-ingestion bounded context — status / resolution policy.
 *
 * Pure candidate status-transition, retry, recovery and idempotency rules
 * with zero framework / DB / I/O imports. The PostgreSQL owner renders the
 * status transitions into SQL; the processing application layer drives the
 * pipeline through these rules.
 */

import type {
  AnalysisSnapshot,
  CandidateStatus,
  DuplicateCase,
  ManualResultSubmission,
} from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Status policy
// ---------------------------------------------------------------------------

/** Maximum processing attempts before a candidate task dead-letters. */
export const MAX_PROCESSING_ATTEMPTS = 3;

/** Status candidates in a restartable (actionable) state. */
export function isActionableCandidateStatus(status: string): boolean {
  return status === 'received' || status === 'queued' || status === 'error';
}

/** Statuses that mark a candidate as interrupted (worker crash recovery). */
export function isInterruptedCandidateStatus(status: string): boolean {
  return status === 'queued' || status === 'analyzing';
}

/** Status a candidate returns to on worker restart recovery. */
export const RECOVERY_STATUS = 'received' as const;

/** Reason recorded when a candidate is recovered after a worker restart. */
export const RECOVERY_REASON = 'Candidate worker restart recovery';

/** Error message recorded when a candidate task dead-letters. */
export const DEAD_LETTER_MESSAGE = 'Candidate processing exhausted retries';

/** Whether a task has exhausted its attempts and must dead-letter. */
export function isDeadLetter(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

/**
 * Terminal status after duplicate analysis: a detected duplicate case
 * parks the candidate for review, otherwise it awaits review.
 */
export function statusAfterAnalysis(hasDuplicateCase: boolean): CandidateStatus {
  return hasDuplicateCase ? 'duplicate_detected' : 'ready_for_review';
}

// ---------------------------------------------------------------------------
// Status update idempotency
// ---------------------------------------------------------------------------

/**
 * Whether a status update is a no-op against the persisted candidate:
 * same status, and for error transitions the same error message.
 */
export function isStatusUpdateNoop(
  existingStatus: string,
  existingLastError: string | null,
  status: CandidateStatus,
  error?: string,
): boolean {
  const errorMessage = error ?? 'Unknown error';
  return existingStatus === status && (status !== 'error' || existingLastError === errorMessage);
}

// ---------------------------------------------------------------------------
// Idempotency comparators for owner attachments
// ---------------------------------------------------------------------------

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Whether a persisted analysis snapshot equals the incoming one. */
export function sameAnalysis(existing: AnalysisSnapshot, incoming: AnalysisSnapshot): boolean {
  return sameJson(existing, incoming);
}

/** Whether a persisted manual result equals the incoming submission. */
export function sameManualResult(
  existing: {
    decision: string;
    notes: string;
    submittedBy: string;
    mergedWith?: unknown;
  },
  incoming: ManualResultSubmission,
  reviewedBy: string,
): boolean {
  return (
    existing.decision === incoming.decision &&
    existing.notes === incoming.notes &&
    existing.submittedBy === reviewedBy &&
    sameJson(existing.mergedWith, incoming.mergedWith)
  );
}

/** Whether a persisted duplicate case equals the incoming one. */
export function sameDuplicateCase(existing: DuplicateCase, incoming: DuplicateCase): boolean {
  return sameJson(existing, incoming);
}
