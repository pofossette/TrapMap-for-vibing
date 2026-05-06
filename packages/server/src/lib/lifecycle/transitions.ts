/**
 * Complete lifecycle transition table with event metadata.
 *
 * Every valid (from, to) pair from VALID_TRANSITIONS in state-machine.ts
 * has an entry here. Event names follow the pattern: knowledge.<action>
 *
 * Phase: 101 (Lifecycle State Machine with Event Bus)
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { TransitionDefinition } from './types.js';

/**
 * Complete lifecycle transition table with event metadata.
 * Every valid (from, to) pair from VALID_TRANSITIONS has an entry here.
 * Event names follow the pattern: knowledge.<action>
 */
export const TRANSITIONS: TransitionDefinition[] = [
  // Submit
  { from: 'draft', to: 'submitted', event: 'knowledge.submitted' },
  // Agent review
  { from: 'submitted', to: 'agent-pass', event: 'knowledge.agent-reviewed' },
  { from: 'submitted', to: 'agent-rejected', event: 'knowledge.agent-reviewed' },
  // Human review
  { from: 'agent-pass', to: 'approved', event: 'knowledge.approved' },
  { from: 'agent-pass', to: 'rejected', event: 'knowledge.rejected' },
  { from: 'agent-rejected', to: 'approved', event: 'knowledge.approved' }, // reviewer override
  { from: 'agent-rejected', to: 'rejected', event: 'knowledge.rejected' },
  // Resubmission
  { from: 'rejected', to: 'agent-pass', event: 'knowledge.resubmitted' },
  { from: 'rejected', to: 'agent-rejected', event: 'knowledge.resubmitted' },
  { from: 'agent-rejected', to: 'agent-pass', event: 'knowledge.resubmitted' },
  // Re-review
  { from: 'approved', to: 'agent-pass', event: 'knowledge.re-review' },
  { from: 'approved', to: 'agent-rejected', event: 'knowledge.re-review' },
  // Deactivation
  { from: 'approved', to: 'deactivated', event: 'knowledge.deactivated' },
  { from: 'rejected', to: 'deactivated', event: 'knowledge.deactivated' },
  { from: 'agent-pass', to: 'deactivated', event: 'knowledge.deactivated' },
  { from: 'agent-rejected', to: 'deactivated', event: 'knowledge.deactivated' },
  // Self-transitions (revision stays in same state)
  { from: 'agent-pass', to: 'agent-pass', event: 'knowledge.agent-reviewed' },
  { from: 'agent-rejected', to: 'agent-rejected', event: 'knowledge.agent-reviewed' },
];

/**
 * Look up the event name for a lifecycle transition.
 * Returns undefined if the (from, to) pair is not in the table.
 */
export function findTransitionEvent(
  from: LifecycleState,
  to: LifecycleState,
): string | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to)?.event;
}
