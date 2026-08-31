import { describe, expect, it } from 'vitest';

import {
  DEACTIVATED_STATE,
  KNOWLEDGE_PROJECTION_OPERATION_CONDITIONS,
  RESUBMIT_TARGET_STATE,
  SUPERSEDE_TARGET_STATE,
  initialLifecycleEventType,
  initialSubmissionState,
  isDeactivationAction,
  reviewDecisionTargetState,
} from '../../../src/knowledge-write/domain/policy.js';

describe('knowledge-write policy domain', () => {
  it('born states: knowledge entries are submitted, traps are approved', () => {
    expect(initialSubmissionState('knowledge', undefined)).toBe('submitted');
    expect(initialSubmissionState('knowledge', null)).toBe('submitted');
    expect(initialSubmissionState('knowledge', 'draft')).toBe('submitted');
    expect(initialSubmissionState('knowledge', 'approved')).toBe('approved');
    expect(initialSubmissionState('trap', undefined)).toBe('approved');
    expect(initialSubmissionState('trap', 'approved')).toBe('approved');
    expect(initialSubmissionState('trap', 'submitted')).toBe('approved');
  });

  it('maps submission entry types to their initial lifecycle event type', () => {
    expect(initialLifecycleEventType('knowledge')).toBe('submitted');
    expect(initialLifecycleEventType('trap')).toBe('reviewer-approved');
  });

  it('maps review decisions to their target states', () => {
    expect(reviewDecisionTargetState('approve')).toBe('approved');
    expect(reviewDecisionTargetState('reject')).toBe('rejected');
    expect(reviewDecisionTargetState('return-for-correction')).toBe('submitted');
  });

  it('exposes fixed command target states', () => {
    expect(RESUBMIT_TARGET_STATE).toBe('submitted');
    expect(SUPERSEDE_TARGET_STATE).toBe('deactivated');
    expect(DEACTIVATED_STATE).toBe('deactivated');
  });

  it('recognizes deactivation as the only lifecycle-changing maintenance action', () => {
    expect(isDeactivationAction('deactivate')).toBe(true);
    expect(isDeactivationAction('refresh')).toBe(false);
    expect(isDeactivationAction('suppress')).toBe(false);
    expect(isDeactivationAction('')).toBe(false);
  });

  it('encodes projection operation eligibility conditions as the sole authority', () => {
    expect(KNOWLEDGE_PROJECTION_OPERATION_CONDITIONS).toEqual({
      'maintenance-due': "(ke.maintenance_meta->>'reviewBy')::timestamptz <= NOW()",
      'decay-eligible': "ke.lifecycle_state = 'approved'",
    });
    expect(KNOWLEDGE_PROJECTION_OPERATION_CONDITIONS['decay-eligible']).toContain("'approved'");
  });
});
