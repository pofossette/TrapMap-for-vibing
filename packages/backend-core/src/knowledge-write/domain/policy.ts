/**
 * Knowledge-write bounded context — policy rules.
 *
 * Pure command-to-state decisions and eligibility rules with zero framework
 * / DB / I/O imports. The PostgreSQL owner renders these into SQL; the
 * application layer uses them for pre-flight command validation.
 */

import type { LifecycleState } from '@trapmap/contracts';

export const DEACTIVATED_STATE = 'deactivated' as const;

export const RESUBMIT_TARGET_STATE = 'submitted' as const;

export const SUPERSEDE_TARGET_STATE = DEACTIVATED_STATE;

/**
 * Initial lifecycle state of a fresh submission: traps are born approved,
 * knowledge entries are born submitted unless the caller already declares
 * an approved state.
 */
export function initialSubmissionState(
  entryType: 'knowledge' | 'trap',
  declaredLifecycleState: unknown,
): LifecycleState {
  return entryType === 'trap' || declaredLifecycleState === 'approved' ? 'approved' : 'submitted';
}

/** Initial lifecycle event type recorded alongside a fresh submission. */
export function initialLifecycleEventType(
  entryType: 'knowledge' | 'trap',
): 'reviewer-approved' | 'submitted' {
  return entryType === 'trap' ? 'reviewer-approved' : 'submitted';
}

/** Target state of a review decision command. */
export function reviewDecisionTargetState(decision: 'approve' | 'reject'): 'approved' | 'rejected' {
  return decision === 'approve' ? 'approved' : 'rejected';
}

/** Whether a maintenance action deactivates the entry. */
export function isDeactivationAction(action: string): boolean {
  return action === 'deactivate';
}

/** Decay eligibility: only approved entries can decay. */
export function isDecayEligible(lifecycleState: LifecycleState): boolean {
  return lifecycleState === 'approved';
}

/** Maintenance due: the entry's review-by deadline has passed. */
export function isMaintenanceDue(
  reviewBy: string | null | undefined,
  now: Date,
): boolean {
  return reviewBy !== null && reviewBy !== undefined && new Date(reviewBy) <= now;
}

/**
 * SQL condition fragments for owner projection operations. Kept as a pure
 * domain constant so the eligibility policy (which entries qualify for a
 * maintenance-due / decay-eligible projection) is not buried in the port.
 */
export const KNOWLEDGE_PROJECTION_OPERATION_CONDITIONS: Readonly<Record<string, string>> = {
  'maintenance-due': "(ke.maintenance_meta->>'reviewBy')::timestamptz <= NOW()",
  'decay-eligible': "ke.lifecycle_state = 'approved'",
};
