import { describe, expect, it } from 'vitest';

import {
  FEEDBACK_REMEDIATION_THRESHOLD,
  INITIAL_FEEDBACK_STATUS,
  activeFeedback,
  ageDays,
  batchActionEligibility,
  batchActionUpdates,
  failureClassificationSummary,
  filterReviewQueueEntries,
  isActiveFeedbackStatus,
  isReviewQueueEntryVisible,
  isTerminalFeedbackStatus,
  lifecycleTriggerReason,
  matchesLifecycleTriggerRule,
  normalizeFeedbackEntryType,
  qualityScore,
  remediationState,
} from './policy.js';

const now = new Date('2026-07-19T00:00:00.000Z');

function feedback(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fb-1',
    entryId: 'entry-1',
    status: 'new',
    submittedAt: '2026-07-18T00:00:00.000Z',
    problemType: 'incorrect',
    remediationStatus: null,
    remediationOpenedAt: null,
    remediationOpenedByUserId: null,
    remediationResolvedAt: null,
    remediationResolvedByUserId: null,
    ...overrides,
  };
}

describe('governance-review feedback policy', () => {
  it('recognizes active and terminal feedback statuses', () => {
    expect(INITIAL_FEEDBACK_STATUS).toBe('new');
    expect(normalizeFeedbackEntryType('skill')).toBe('skill');
    expect(normalizeFeedbackEntryType('trap')).toBe('trap');
    expect(normalizeFeedbackEntryType(undefined)).toBe('trap');
    expect(isActiveFeedbackStatus('new')).toBe(true);
    expect(isActiveFeedbackStatus('triaged')).toBe(true);
    expect(isActiveFeedbackStatus('resolved')).toBe(false);
    expect(isActiveFeedbackStatus('dismissed')).toBe(false);
    expect(isTerminalFeedbackStatus('resolved')).toBe(true);
    expect(isTerminalFeedbackStatus('dismissed')).toBe(true);
    expect(isTerminalFeedbackStatus('new')).toBe(false);
  });

  it('computes feedback age in fractional days', () => {
    expect(ageDays('2026-07-18T00:00:00.000Z', now)).toBe(1);
    expect(ageDays('2026-07-18T12:00:00.000Z', now)).toBe(0.5);
    expect(ageDays('2026-07-19T00:00:00.000Z', now)).toBe(0);
  });

  it('filters active feedback per entry', () => {
    const records = [
      feedback(),
      feedback({ id: 'fb-2', status: 'triaged' }),
      feedback({ id: 'fb-3', status: 'resolved' }),
      feedback({ id: 'fb-4', entryId: 'entry-2' }),
    ];
    expect(activeFeedback(records, 'entry-1').map((record) => record.id)).toEqual(['fb-1', 'fb-2']);
  });

  it('requires the remediation threshold of active feedback', () => {
    expect(FEEDBACK_REMEDIATION_THRESHOLD).toBe(10);
    const below = Array.from({ length: 9 }, (_, index) => feedback({ id: `fb-${index + 1}` }));
    const at = Array.from({ length: 10 }, (_, index) => feedback({ id: `fb-${index + 1}` }));
    expect(remediationState(below, 'entry-1')).toBeNull();
    expect(remediationState(at, 'entry-1')).not.toBeNull();
  });

  it('derives pending-human-review state with suppressed flags and ids', () => {
    const records = Array.from({ length: 10 }, (_, index) =>
      feedback({
        id: `fb-${index + 1}`,
        submittedAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    expect(remediationState(records, 'entry-1')).toEqual({
      status: 'pending-human-review',
      triggeredByFeedbackCount: 10,
      threshold: 10,
      suppressedFromRetrieval: true,
      suppressedFromIndex: true,
      activeFeedbackIds: records.map((record) => record.id),
      openedAt: '2026-07-01T00:00:00.000Z',
      openedByUserId: null,
      resolvedAt: null,
      resolvedByUserId: null,
    });
  });

  it('promotes in-remediation and ready-to-reindex statuses', () => {
    const inRemediation = Array.from({ length: 10 }, (_, index) =>
      feedback({
        id: `fb-${index + 1}`,
        remediationStatus: index === 0 ? 'in-remediation' : null,
      }),
    );
    expect(remediationState(inRemediation, 'entry-1')?.status).toBe('in-remediation');

    const ready = Array.from({ length: 10 }, (_, index) =>
      feedback({
        id: `fb-${index + 1}`,
        remediationStatus: index === 3 ? 'ready-to-reindex' : 'in-remediation',
      }),
    );
    expect(remediationState(ready, 'entry-1')?.status).toBe('ready-to-reindex');
  });

  it('aggregates resolved-at metadata and falls back to first submitted-at', () => {
    const records = [
      feedback({
        id: 'fb-1',
        remediationOpenedAt: '2026-07-10T00:00:00.000Z',
        remediationOpenedByUserId: 'admin-1',
      }),
      ...Array.from({ length: 9 }, (_, index) => feedback({ id: `fb-${index + 2}` })),
    ];
    const state = remediationState(records, 'entry-1');
    expect(state).toMatchObject({
      openedAt: '2026-07-10T00:00:00.000Z',
      openedByUserId: 'admin-1',
    });

    const resolved = [
      feedback({ id: 'fb-1', remediationResolvedAt: '2026-07-16T00:00:00.000Z' }),
      feedback({
        id: 'fb-2',
        remediationResolvedAt: '2026-07-17T00:00:00.000Z',
        remediationResolvedByUserId: 'admin-2',
      }),
      ...Array.from({ length: 8 }, (_, index) => feedback({ id: `fb-${index + 3}` })),
    ];
    expect(remediationState(resolved, 'entry-1')).toMatchObject({
      resolvedAt: '2026-07-17T00:00:00.000Z',
      resolvedByUserId: 'admin-2',
    });
  });

  it('summarizes failure classifications with the dominant class', () => {
    const summary = failureClassificationSummary([
      { failureClassification: 'recall-miss' },
      { failureClassification: 'recall-miss' },
      { failureClassification: 'stale-content' },
      { failureClassification: 'missing-recall' },
      { failureClassification: null },
    ]);
    expect(summary.totalClassified).toBe(4);
    expect(summary.dominantClassification).toBe('recall-miss');
    expect(summary.counts.find((item) => item.classification === 'recall-miss')?.count).toBe(3);
  });
});

describe('governance-review batch policy', () => {
  it('marks missing and terminal records ineligible with reasons', () => {
    expect(batchActionEligibility('resolve', null, undefined)).toEqual({
      eligible: false,
      reason: 'Feedback not found',
    });
    expect(batchActionEligibility('resolve', { status: 'resolved' }, undefined)).toEqual({
      eligible: false,
      reason: 'Feedback already resolved',
    });
    expect(batchActionEligibility('dismiss', { status: 'dismissed' }, undefined)).toEqual({
      eligible: false,
      reason: 'Feedback already dismissed',
    });
  });

  it('restricts triage to new feedback and transition to a target', () => {
    expect(batchActionEligibility('triage', { status: 'new' }, undefined)).toEqual({
      eligible: true,
      reason: null,
    });
    expect(batchActionEligibility('triage', { status: 'triaged' }, undefined)).toEqual({
      eligible: false,
      reason: 'Only new feedback can be triaged',
    });
    expect(batchActionEligibility('transition', { status: 'new' }, undefined)).toEqual({
      eligible: false,
      reason: 'transitionTarget required for transition action',
    });
    expect(batchActionEligibility('transition', { status: 'new' }, 'reindex')).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it('maps batch actions to persisted updates', () => {
    expect(batchActionUpdates('resolve', undefined, '2026-07-19T00:00:00.000Z', 'admin-1')).toEqual(
      {
        status: 'resolved',
        resolvedAt: '2026-07-19T00:00:00.000Z',
        resolvedByUserId: 'admin-1',
      },
    );
    expect(batchActionUpdates('dismiss', undefined, 'x', 'admin-1')).toEqual({
      status: 'dismissed',
    });
    expect(batchActionUpdates('triage', undefined, 'x', 'admin-1')).toEqual({ status: 'triaged' });
    expect(batchActionUpdates('transition', 'reindex', 'x', 'admin-1')).toEqual({
      triggeredTransition: 'reindex',
    });
  });
});

describe('governance-review quality score', () => {
  it('degrades the score per unresolved, incorrect and outdated feedback', () => {
    expect(qualityScore(0, 0, 0)).toBe(1);
    expect(qualityScore(2, 1, 1)).toBe(0.7);
    expect(qualityScore(20, 0, 0)).toBe(0);
  });
});

describe('governance-review lifecycle trigger rules', () => {
  const rule = {
    problemType: 'outdated',
    minCount: 3,
    timeWindowDays: 30,
    targetDecayState: 'stale' as const,
  };

  it('matches records by problem type, status and age window', () => {
    const nowDate = new Date('2026-07-19T00:00:00.000Z');
    expect(
      matchesLifecycleTriggerRule(
        { status: 'new', problemType: 'outdated', submittedAt: '2026-07-01T00:00:00.000Z' },
        rule,
        nowDate,
      ),
    ).toBe(true);
    expect(
      matchesLifecycleTriggerRule(
        { status: 'dismissed', problemType: 'outdated', submittedAt: '2026-07-01T00:00:00.000Z' },
        rule,
        nowDate,
      ),
    ).toBe(false);
    expect(
      matchesLifecycleTriggerRule(
        { status: 'new', problemType: 'incorrect', submittedAt: '2026-07-01T00:00:00.000Z' },
        rule,
        nowDate,
      ),
    ).toBe(false);
    expect(
      matchesLifecycleTriggerRule(
        { status: 'new', problemType: 'outdated', submittedAt: '2026-05-01T00:00:00.000Z' },
        rule,
        nowDate,
      ),
    ).toBe(false);
  });

  it('formats the trigger reason', () => {
    expect(lifecycleTriggerReason(3, rule)).toBe("3 'outdated' feedback in last 30 days");
  });
});

describe('governance-review review-queue eligibility', () => {
  const entries = [
    { id: 'e1', teamId: 'team-1', requiredLevel: 3, lifecycleState: 'submitted' },
    { id: 'e2', teamId: 'team-2', requiredLevel: 3, lifecycleState: 'submitted' },
    { id: 'e3', teamId: null, requiredLevel: 5, lifecycleState: 'approved' },
  ];

  it('gates by team and security level for regular users', () => {
    const auth = { subjectType: 'user' as const, activeTeamId: 'team-1', securityLevel: 9 };
    const visible = filterReviewQueueEntries(entries, { auth });
    expect(visible.map((entry) => entry.id)).toEqual(['e1', 'e3']);
  });

  it('excludes entries above the reviewer security level', () => {
    const auth = { subjectType: 'user' as const, activeTeamId: 'team-1', securityLevel: 3 };
    const visible = filterReviewQueueEntries(entries, { auth });
    expect(visible.map((entry) => entry.id)).toEqual([]);
  });

  it('system admins see all entries and can filter by lifecycle state', () => {
    const auth = { subjectType: 'system-admin' as const, activeTeamId: null, securityLevel: 10 };
    expect(filterReviewQueueEntries(entries, { auth }).map((entry) => entry.id)).toEqual([
      'e1',
      'e2',
      'e3',
    ]);
    expect(
      filterReviewQueueEntries(entries, { auth, status: 'approved' }).map((entry) => entry.id),
    ).toEqual(['e3']);
  });

  it('exposes the eligibility predicate', () => {
    const auth = { subjectType: 'user' as const, activeTeamId: 'team-1', securityLevel: 9 };
    expect(isReviewQueueEntryVisible(entries[0]!, auth)).toBe(true);
    expect(isReviewQueueEntryVisible(entries[1]!, auth)).toBe(false);
  });
});
