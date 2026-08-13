import { describe, expect, it } from 'vitest';

import type { LifecycleState } from '@trapmap/contracts';

import {
  LIFECYCLE_TRANSITIONS,
  assertValidLifecycleTransition,
  canTransition,
  lifecycleEventType,
  lifecycleOutboxEventName,
} from './lifecycle.js';

const ALL_STATES: readonly LifecycleState[] = [
  'draft',
  'submitted',
  'agent-pass',
  'agent-rejected',
  'approved',
  'rejected',
  'deactivated',
];

describe('knowledge-write lifecycle domain', () => {
  it('locks the full transition table as the authoritative truth', () => {
    expect(LIFECYCLE_TRANSITIONS).toEqual({
      draft: ['submitted', 'approved'],
      submitted: ['agent-pass', 'agent-rejected'],
      'agent-pass': ['approved', 'rejected', 'deactivated', 'agent-pass'],
      'agent-rejected': ['agent-pass', 'rejected', 'approved', 'deactivated', 'agent-rejected'],
      approved: ['deactivated', 'agent-pass', 'agent-rejected'],
      rejected: ['submitted', 'agent-pass', 'agent-rejected', 'deactivated'],
      deactivated: [],
    });
  });

  it('accepts every transition declared in the table', () => {
    for (const previous of ALL_STATES) {
      for (const next of LIFECYCLE_TRANSITIONS[previous]) {
        expect(canTransition(previous, next)).toBe(true);
        expect(() => assertValidLifecycleTransition(previous, next)).not.toThrow();
      }
    }
  });

  it('rejects every transition not declared in the table', () => {
    for (const previous of ALL_STATES) {
      for (const next of ALL_STATES) {
        if (LIFECYCLE_TRANSITIONS[previous].includes(next)) continue;
        expect(canTransition(previous, next)).toBe(false);
        expect(() => assertValidLifecycleTransition(previous, next)).toThrow(
          `Invalid lifecycle transition: ${previous} → ${next}`,
        );
      }
    }
  });

  it('treats deactivated as a terminal state', () => {
    expect(LIFECYCLE_TRANSITIONS.deactivated).toEqual([]);
    for (const next of ALL_STATES) {
      expect(canTransition('deactivated', next)).toBe(false);
    }
  });

  it('maps lifecycle states to outbox event names', () => {
    expect(lifecycleOutboxEventName('approved')).toBe('knowledge.approved');
    expect(lifecycleOutboxEventName('rejected')).toBe('knowledge.rejected');
    expect(lifecycleOutboxEventName('submitted')).toBe('knowledge.submitted');
    expect(lifecycleOutboxEventName('draft')).toBe('knowledge.lifecycle-updated');
    expect(lifecycleOutboxEventName('agent-pass')).toBe('knowledge.lifecycle-updated');
    expect(lifecycleOutboxEventName('agent-rejected')).toBe('knowledge.lifecycle-updated');
    expect(lifecycleOutboxEventName('deactivated')).toBe('knowledge.lifecycle-updated');
  });

  it('maps lifecycle states to lifecycle event types', () => {
    expect(lifecycleEventType('approved')).toBe('reviewer-approved');
    expect(lifecycleEventType('rejected')).toBe('reviewer-rejected');
    expect(lifecycleEventType('submitted')).toBe('resubmitted');
    expect(lifecycleEventType('agent-pass')).toBe('updated');
    expect(lifecycleEventType('deactivated')).toBe('updated');
  });
});
