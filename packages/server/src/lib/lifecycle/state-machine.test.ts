import { describe, expect, it } from 'vitest';

import type { LifecycleState } from '@trapmap/contracts';
import { LifecycleEventBus } from './event-bus.js';
import {
  executeTransition,
  getValidTransitions,
  isTerminalState,
  isValidTransition,
  transitionLifecycleState,
} from './state-machine.js';
import type { DomainEvent } from './types.js';

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

    it('allows agent-rejected → approved (reviewer override)', () => {
      expect(isValidTransition('agent-rejected', 'approved')).toBe(true);
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
      expect(transitions).toContain('agent-pass'); // Revision can stay in agent-pass
      expect(transitions).toHaveLength(4);
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
      expect(transitions).toContain('agent-rejected'); // Revision can stay in agent-rejected
      expect(transitions).toContain('approved'); // Reviewer can override and approve
      expect(transitions).toHaveLength(5);
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

describe('executeTransition', () => {
  it('mutates entry state and emits domain event', () => {
    const bus = new LifecycleEventBus();
    const entry = { lifecycleState: 'agent-pass' as LifecycleState };
    const events: DomainEvent[] = [];
    bus.onDomainEvent('knowledge.approved', (e) => events.push(e));

    const event = executeTransition(
      entry,
      'approved',
      { entryId: 'entry-1', actorId: 'user-1', reason: 'test' },
      bus,
    );

    expect(entry.lifecycleState).toBe('approved');
    expect(event.name).toBe('knowledge.approved');
    expect(event.previousState).toBe('agent-pass');
    expect(event.nextState).toBe('approved');
    expect(events).toHaveLength(1);
  });

  it('includes previousState captured before mutation', () => {
    const bus = new LifecycleEventBus();
    const entry = { lifecycleState: 'agent-pass' as LifecycleState };
    let capturedPrev: LifecycleState | undefined;
    bus.onDomainEvent('knowledge.approved', (e) => {
      capturedPrev = e.previousState;
    });

    executeTransition(
      entry,
      'approved',
      { entryId: 'e1', actorId: 'u1', reason: 'r' },
      bus,
    );
    expect(capturedPrev).toBe('agent-pass');
  });

  it('throws on invalid transition without emitting event', () => {
    const bus = new LifecycleEventBus();
    const entry = { lifecycleState: 'deactivated' as LifecycleState };
    const events: DomainEvent[] = [];
    bus.onDomainEvent('knowledge.approved', (e) => events.push(e));

    expect(() =>
      executeTransition(
        entry,
        'approved',
        { entryId: 'e1', actorId: 'u1', reason: 'r' },
        bus,
      ),
    ).toThrow('Invalid lifecycle transition');
    expect(events).toHaveLength(0);
  });

  it('returns the emitted DomainEvent', () => {
    const bus = new LifecycleEventBus();
    const entry = { lifecycleState: 'draft' as LifecycleState };
    const event = executeTransition(
      entry,
      'submitted',
      { entryId: 'e1', actorId: 'u1', reason: 'submit' },
      bus,
    );
    expect(event).toMatchObject({
      name: 'knowledge.submitted',
      entryId: 'e1',
      previousState: 'draft',
      nextState: 'submitted',
    });
  });

  it('includes metadata when provided', () => {
    const bus = new LifecycleEventBus();
    const entry = { lifecycleState: 'agent-pass' as LifecycleState };
    const event = executeTransition(
      entry,
      'approved',
      { entryId: 'e1', actorId: 'u1', reason: 'r', metadata: { key: 'val' } },
      bus,
    );
    expect(event.metadata).toEqual({ key: 'val' });
  });

  it('omits metadata when not provided', () => {
    const bus = new LifecycleEventBus();
    const entry = { lifecycleState: 'agent-pass' as LifecycleState };
    const event = executeTransition(
      entry,
      'approved',
      { entryId: 'e1', actorId: 'u1', reason: 'r' },
      bus,
    );
    expect(event).not.toHaveProperty('metadata');
  });
});
