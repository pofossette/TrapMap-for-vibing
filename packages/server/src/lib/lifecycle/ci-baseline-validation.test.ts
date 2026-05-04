/**
 * Phase 68 CI Baseline Validation Tests.
 *
 * Adversarial tests verifying the three validation gaps:
 * 1. Previously-failing tests now pass (lifecycle state machine behavioral contracts)
 * 2. No regressions introduced (transition rules are correctly enforced)
 * 3. CI baseline is green (schemas validate, transitions are complete)
 *
 * These tests specifically target the behavioral contracts that were broken
 * before the Phase 68 fix -- namely, that review approval requires
 * lifecycleState to be 'agent-pass', not 'submitted' or 'draft'.
 */

import { describe, expect, it } from 'vitest';

import type { LifecycleState } from '@trapmap/contracts';

import {
  getValidTransitions,
  isTerminalState,
  isValidTransition,
  transitionLifecycleState,
} from './state-machine.js';

// ---------------------------------------------------------------------------
// Gap 1: All previously-failing tests now pass
// Verifies the lifecycle state machine behavioral contract that was the root
// cause of test failures: review approval requires agent-pass state.
// ---------------------------------------------------------------------------

describe('Phase 68 CI Baseline Validation', () => {
  describe('Gap 1: previously-failing lifecycle transitions are now correct', () => {
    it('agent-pass to approved transition is valid (was the core fix)', () => {
      // Before the fix, tests tried to approve entries not in agent-pass state.
      // The state machine must allow this specific transition.
      expect(isValidTransition('agent-pass', 'approved')).toBe(true);
    });

    it('agent-pass to rejected transition is valid', () => {
      expect(isValidTransition('agent-pass', 'rejected')).toBe(true);
    });

    it('submitted to approved is NOT a valid transition (must go through agent-pass first)', () => {
      // This is the key behavioral contract: you cannot approve directly from submitted.
      // The agent review gate must be passed first.
      expect(isValidTransition('submitted', 'approved')).toBe(false);
    });

    it('draft to approved is NOT a valid transition', () => {
      expect(isValidTransition('draft', 'approved')).toBe(false);
    });

    it('transitioning agent-pass entry to approved succeeds without error', () => {
      const entry = { lifecycleState: 'agent-pass' as LifecycleState };
      expect(() => transitionLifecycleState(entry, 'approved', 'review')).not.toThrow();
      expect(entry.lifecycleState).toBe('approved');
    });

    it('transitioning submitted entry to approved throws error', () => {
      const entry = { lifecycleState: 'submitted' as LifecycleState };
      expect(() => transitionLifecycleState(entry, 'approved', 'review')).toThrow(
        /Invalid lifecycle transition/,
      );
    });

    it('transitioning agent-rejected entry to approved succeeds (reviewer override)', () => {
      // Even after agent rejection, a human reviewer can override to approved
      const entry = { lifecycleState: 'agent-rejected' as LifecycleState };
      expect(() => transitionLifecycleState(entry, 'approved', 'review')).not.toThrow();
      expect(entry.lifecycleState).toBe('approved');
    });
  });

  // ---------------------------------------------------------------------------
  // Gap 2: No regressions introduced
  // Verifies the complete transition graph has not been inadvertently changed.
  // ---------------------------------------------------------------------------

  describe('Gap 2: no regressions in full state transition graph', () => {
    it('deactivated is terminal with zero outgoing transitions', () => {
      expect(getValidTransitions('deactivated')).toEqual([]);
      expect(isTerminalState('deactivated')).toBe(true);
    });

    it('draft has exactly one transition: to submitted', () => {
      const transitions = getValidTransitions('draft');
      expect(transitions).toEqual(['submitted']);
    });

    it('submitted has exactly two transitions: agent-pass and agent-rejected', () => {
      const transitions = getValidTransitions('submitted');
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain('agent-pass');
      expect(transitions).toContain('agent-rejected');
    });

    it('approved allows re-review transitions (deactivated, agent-pass, agent-rejected)', () => {
      const transitions = getValidTransitions('approved');
      expect(transitions).toHaveLength(3);
      expect(transitions).toContain('deactivated');
      expect(transitions).toContain('agent-pass');
      expect(transitions).toContain('agent-rejected');
    });

    it('rejected allows resubmission transitions (agent-pass, agent-rejected, deactivated)', () => {
      const transitions = getValidTransitions('rejected');
      expect(transitions).toHaveLength(3);
      expect(transitions).toContain('agent-pass');
      expect(transitions).toContain('agent-rejected');
      expect(transitions).toContain('deactivated');
    });

    it('all non-terminal states have at least one outgoing transition', () => {
      const nonTerminal: LifecycleState[] = [
        'draft',
        'submitted',
        'agent-pass',
        'agent-rejected',
        'approved',
        'rejected',
      ];
      for (const state of nonTerminal) {
        const transitions = getValidTransitions(state);
        expect(transitions.length).toBeGreaterThan(0);
      }
    });

    it('full forward lifecycle path draft->submitted->agent-pass->approved is traversable', () => {
      const entry = { lifecycleState: 'draft' as LifecycleState };

      // Step 1: draft -> submitted
      transitionLifecycleState(entry, 'submitted', 'submit');
      expect(entry.lifecycleState).toBe('submitted');

      // Step 2: submitted -> agent-pass (agent review passes)
      transitionLifecycleState(entry, 'agent-pass', 'agent-review');
      expect(entry.lifecycleState).toBe('agent-pass');

      // Step 3: agent-pass -> approved (human reviewer approves)
      transitionLifecycleState(entry, 'approved', 'review');
      expect(entry.lifecycleState).toBe('approved');
    });

    it('rejection path draft->submitted->agent-pass->rejected is traversable', () => {
      const entry = { lifecycleState: 'draft' as LifecycleState };

      transitionLifecycleState(entry, 'submitted', 'submit');
      transitionLifecycleState(entry, 'agent-pass', 'agent-review');
      transitionLifecycleState(entry, 'rejected', 'review');
      expect(entry.lifecycleState).toBe('rejected');
    });

    it('agent-rejection path draft->submitted->agent-rejected is traversable', () => {
      const entry = { lifecycleState: 'draft' as LifecycleState };

      transitionLifecycleState(entry, 'submitted', 'submit');
      transitionLifecycleState(entry, 'agent-rejected', 'agent-review');
      expect(entry.lifecycleState).toBe('agent-rejected');
    });
  });

  // ---------------------------------------------------------------------------
  // Gap 3: CI baseline is green (schema and type contracts)
  // ---------------------------------------------------------------------------

  describe('Gap 3: CI baseline schema contracts are intact', () => {
    it('LifecycleState type covers all expected states', () => {
      // Verify the state machine handles every known lifecycle state
      const allStates: LifecycleState[] = [
        'draft',
        'submitted',
        'agent-pass',
        'agent-rejected',
        'approved',
        'rejected',
        'deactivated',
      ];

      for (const state of allStates) {
        // Each state must be queryable without error
        const transitions = getValidTransitions(state);
        expect(Array.isArray(transitions)).toBe(true);

        // isTerminalState must return a boolean
        expect(typeof isTerminalState(state)).toBe('boolean');
      }
    });

    it('transition error messages contain from and to states', () => {
      const entry = { lifecycleState: 'deactivated' as LifecycleState };
      try {
        transitionLifecycleState(entry, 'approved', 'error-context');
        expect.unreachable('Should have thrown');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('deactivated');
        expect(message).toContain('approved');
        expect(message).toContain('error-context');
      }
    });

    it('agent-pass can stay in agent-pass (revision re-pass)', () => {
      // This was a specific behavior noted in the fix: when a revision passes
      // agent review, the state stays agent-pass
      expect(isValidTransition('agent-pass', 'agent-pass')).toBe(true);
    });

    it('agent-rejected can stay in agent-rejected (revision re-fails)', () => {
      expect(isValidTransition('agent-rejected', 'agent-rejected')).toBe(true);
    });
  });
});
