import { describe, expect, it } from 'vitest';

import {
  getValidTransitions,
  isTerminalState,
  isValidTransition,
  transitionLifecycleState,
} from './state-machine.js';
import type { LifecycleState } from '@trapmap/contracts';

describe('lifecycle state machine', () => {
  describe('isValidTransition', () => {
    it('allows agent-pass → approved', () => {
      expect(isValidTransition('agent-pass', 'approved')).toBe(true);
    });

    it('allows agent-pass → rejected', () => {
      expect(isValidTransition('agent-pass', 'rejected')).toBe(true);
    });

    it('allows agent-pass → deactivated', () => {
      expect(isValidTransition('agent-pass', 'deactivated')).toBe(true);
    });

    it('disallows agent-pass → draft', () => {
      expect(isValidTransition('agent-pass', 'draft')).toBe(false);
    });

    it('disallows deactivated → any state', () => {
      const states: LifecycleState[] = [
        'draft',
        'submitted',
        'agent-pass',
        'agent-rejected',
        'approved',
        'rejected',
        'deactivated',
      ];
      for (const target of states) {
        expect(isValidTransition('deactivated', target)).toBe(false);
      }
    });

    it('allows approved → deactivated', () => {
      expect(isValidTransition('approved', 'deactivated')).toBe(true);
    });

    it('allows approved → agent-pass (re-review)', () => {
      expect(isValidTransition('approved', 'agent-pass')).toBe(true);
    });

    it('allows approved → agent-rejected (re-review)', () => {
      expect(isValidTransition('approved', 'agent-rejected')).toBe(true);
    });

    it('allows rejected → agent-pass', () => {
      expect(isValidTransition('rejected', 'agent-pass')).toBe(true);
    });

    it('allows rejected → agent-rejected', () => {
      expect(isValidTransition('rejected', 'agent-rejected')).toBe(true);
    });

    it('allows rejected → deactivated', () => {
      expect(isValidTransition('rejected', 'deactivated')).toBe(true);
    });

    it('allows agent-rejected → agent-pass', () => {
      expect(isValidTransition('agent-rejected', 'agent-pass')).toBe(true);
    });

    it('allows agent-rejected → rejected', () => {
      expect(isValidTransition('agent-rejected', 'rejected')).toBe(true);
    });

    it('allows agent-rejected → deactivated', () => {
      expect(isValidTransition('agent-rejected', 'deactivated')).toBe(true);
    });

    it('allows draft → submitted', () => {
      expect(isValidTransition('draft', 'submitted')).toBe(true);
    });

    it('allows submitted → agent-pass', () => {
      expect(isValidTransition('submitted', 'agent-pass')).toBe(true);
    });

    it('allows submitted → agent-rejected', () => {
      expect(isValidTransition('submitted', 'agent-rejected')).toBe(true);
    });
  });

  describe('transitionLifecycleState', () => {
    it('mutates state on valid transition', () => {
      const entry = { lifecycleState: 'agent-pass' as LifecycleState };
      transitionLifecycleState(entry, 'approved', 'test');
      expect(entry.lifecycleState).toBe('approved');
    });

    it('throws on invalid transition', () => {
      const entry = { lifecycleState: 'deactivated' as LifecycleState };
      expect(() => transitionLifecycleState(entry, 'approved', 'test')).toThrow(
        'Invalid lifecycle transition: deactivated → approved (test)',
      );
    });

    it('includes context in error message', () => {
      const entry = { lifecycleState: 'approved' as LifecycleState };
      expect(() => transitionLifecycleState(entry, 'submitted', 'my context')).toThrow(
        'Invalid lifecycle transition: approved → submitted (my context)',
      );
    });
  });

  describe('isTerminalState', () => {
    it('returns true for deactivated', () => {
      expect(isTerminalState('deactivated')).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      const nonTerminal: LifecycleState[] = [
        'draft',
        'submitted',
        'agent-pass',
        'agent-rejected',
        'approved',
        'rejected',
      ];
      for (const state of nonTerminal) {
        expect(isTerminalState(state)).toBe(false);
      }
    });
  });

  describe('getValidTransitions', () => {
    it('returns correct transitions for agent-pass', () => {
      const transitions = getValidTransitions('agent-pass');
      expect(transitions).toContain('approved');
      expect(transitions).toContain('rejected');
      expect(transitions).toContain('deactivated');
      expect(transitions).toHaveLength(3);
    });

    it('returns empty array for deactivated', () => {
      expect(getValidTransitions('deactivated')).toEqual([]);
    });

    it('returns correct transitions for approved', () => {
      const transitions = getValidTransitions('approved');
      expect(transitions).toContain('deactivated');
      expect(transitions).toContain('agent-pass');
      expect(transitions).toContain('agent-rejected');
      expect(transitions).toHaveLength(3);
    });

    it('returns correct transitions for rejected', () => {
      const transitions = getValidTransitions('rejected');
      expect(transitions).toContain('agent-pass');
      expect(transitions).toContain('agent-rejected');
      expect(transitions).toContain('deactivated');
      expect(transitions).toHaveLength(3);
    });

    it('returns correct transitions for agent-rejected', () => {
      const transitions = getValidTransitions('agent-rejected');
      expect(transitions).toContain('agent-pass');
      expect(transitions).toContain('rejected');
      expect(transitions).toContain('deactivated');
      expect(transitions).toHaveLength(3);
    });

    it('returns correct transitions for draft', () => {
      const transitions = getValidTransitions('draft');
      expect(transitions).toContain('submitted');
      expect(transitions).toHaveLength(1);
    });

    it('returns correct transitions for submitted', () => {
      const transitions = getValidTransitions('submitted');
      expect(transitions).toContain('agent-pass');
      expect(transitions).toContain('agent-rejected');
      expect(transitions).toHaveLength(2);
    });
  });
});
