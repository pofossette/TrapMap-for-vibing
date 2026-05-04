/**
 * Lifecycle state machine for knowledge entries and skill artifacts.
 *
 * This module provides:
 * - State transition validation
 * - Terminal state detection
 * - Valid transition enumeration
 *
 * Phase: 62 (WRITE-02)
 */

import type { LifecycleState } from '@trapmap/contracts';

/**
 * Valid state transitions map.
 * Each key maps to an array of states that can be transitioned to.
 */
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ['submitted'],
  submitted: ['agent-pass', 'agent-rejected'],
  'agent-pass': ['approved', 'rejected', 'deactivated', 'agent-pass'], // Can stay when revision passes
  'agent-rejected': ['agent-pass', 'rejected', 'approved', 'deactivated', 'agent-rejected'], // Can stay when revision fails, reviewer can approve
  approved: ['deactivated', 'agent-pass', 'agent-rejected'], // Can re-review
  rejected: ['agent-pass', 'agent-rejected', 'deactivated'], // Can resubmit
  deactivated: [], // Terminal state
};

/**
 * Check if a transition from one state to another is valid.
 *
 * @param from - Current lifecycle state
 * @param to - Target lifecycle state
 * @returns true if the transition is valid
 */
export function isValidTransition(from: LifecycleState, to: LifecycleState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get all valid transitions from a given state.
 *
 * @param state - Current lifecycle state
 * @returns Array of valid target states
 */
export function getValidTransitions(state: LifecycleState): LifecycleState[] {
  return VALID_TRANSITIONS[state] ?? [];
}

/**
 * Check if a state is terminal (no transitions allowed).
 *
 * @param state - Lifecycle state to check
 * @returns true if the state is terminal
 */
export function isTerminalState(state: LifecycleState): boolean {
  return state === 'deactivated';
}

/**
 * Entry interface for lifecycle state transition.
 * Minimal interface to avoid coupling to full KnowledgeRecord/SkillArtifactRecord.
 */
interface LifecycleTransitionable {
  lifecycleState: LifecycleState;
}

/**
 * Transition an entry to a new lifecycle state.
 * Validates the transition and mutates the entry.
 *
 * @param entry - Entry to transition (will be mutated)
 * @param newState - Target lifecycle state
 * @param context - Context string for error messages (e.g., 'update', 'review')
 * @throws Error if the transition is invalid
 */
export function transitionLifecycleState(
  entry: LifecycleTransitionable,
  newState: LifecycleState,
  context: string,
): void {
  const currentState = entry.lifecycleState;

  if (!isValidTransition(currentState, newState)) {
    throw new Error(`Invalid lifecycle transition: ${currentState} → ${newState} (${context})`);
  }

  entry.lifecycleState = newState;
}
