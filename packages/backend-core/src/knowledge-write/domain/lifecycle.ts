/**
 * Knowledge-write bounded context — lifecycle state machine.
 *
 * Pure domain rules with zero framework / DB / I/O imports. The transition
 * table is the single source of truth for every lifecycle movement; the
 * PostgreSQL owner enforces it inside its transactions.
 */

import type { LifecycleState } from '@trapmap/contracts';

export const LIFECYCLE_TRANSITIONS: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  draft: ['submitted', 'approved'],
  submitted: ['agent-pass', 'agent-rejected'],
  'agent-pass': ['approved', 'rejected', 'deactivated', 'agent-pass'],
  'agent-rejected': ['agent-pass', 'rejected', 'approved', 'deactivated', 'agent-rejected'],
  approved: ['deactivated', 'agent-pass', 'agent-rejected'],
  rejected: ['submitted', 'agent-pass', 'agent-rejected', 'deactivated'],
  deactivated: [],
};

export function canTransition(
  previousState: LifecycleState,
  nextState: LifecycleState,
): boolean {
  return LIFECYCLE_TRANSITIONS[previousState].includes(nextState);
}

export function assertValidLifecycleTransition(
  previousState: LifecycleState,
  nextState: LifecycleState,
): void {
  if (!canTransition(previousState, nextState)) {
    throw new Error(`Invalid lifecycle transition: ${previousState} → ${nextState}`);
  }
}

/** Outbox event name for a knowledge lifecycle state change. */
export function lifecycleOutboxEventName(state: LifecycleState): string {
  if (state === 'approved') return 'knowledge.approved';
  if (state === 'rejected') return 'knowledge.rejected';
  if (state === 'submitted') return 'knowledge.submitted';
  return 'knowledge.lifecycle-updated';
}

/** Human-facing lifecycle event type recorded for a state change. */
export function lifecycleEventType(state: LifecycleState): string {
  if (state === 'approved') return 'reviewer-approved';
  if (state === 'rejected') return 'reviewer-rejected';
  if (state === 'submitted') return 'resubmitted';
  return 'updated';
}
