import type { KnowledgeEntry, ReviewQueueQuery } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import {
  applyReviewQueueQuery,
  calculateReviewQueueRiskScore,
  decodeReviewQueueOffset,
} from '../../../src/governance-review/domain/review-queue-query.js';

const actor = { id: 'user-1', handle: 'alice', securityLevel: 3 };

function createQueueEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  const submittedAt = '2026-06-01T10:00:00.000Z';
  const revision = {
    revision: 1,
    submittedAt,
    submittedBy: actor,
    shortcut: 'Runtime candidate',
    detail: 'Needs governance review',
    labels: ['runtime'],
    reviewNotes: [],
  };

  return {
    id: 'entry-1',
    teamId: null,
    scope: 'project',
    labels: ['runtime'],
    shortcut: 'Runtime candidate',
    detail: 'Needs governance review',
    requiredLevel: 3,
    lifecycleState: 'submitted',
    owner: actor,
    latestRevision: revision,
    history: [revision],
    metadata: {
      scopeLabel: 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'source-1',
      latestSubmittedAt: submittedAt,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmission: {
      id: 'source-1',
      revision: 1,
      submittedAt,
      submittedBy: actor,
      lifecycleState: 'submitted',
      resubmissionOf: null,
      agentReview: null,
      reviewerDecision: null,
      reviewNotes: [],
    },
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:01:00.000Z',
    ...overrides,
  };
}

function createQuery(overrides: Partial<ReviewQueueQuery> = {}): ReviewQueueQuery {
  return { cursor: undefined, limit: 2, sort: 'highest-risk', ...overrides };
}

describe('review queue query domain', () => {
  it('scores agent risk with the same weights shown in the panel', () => {
    expect(calculateReviewQueueRiskScore(null)).toBe(0);
    expect(
      calculateReviewQueueRiskScore({
        status: 'agent-rejected',
        duplicateRisk: 'high',
        correctnessRisk: 'medium',
        completenessRisk: 'low',
        checkedAt: '2026-06-01T10:00:00.000Z',
        notes: [],
      }),
    ).toBe(6);
  });

  it('filters, sorts, and reports distinct filtered and authorized totals', () => {
    const high = createQueueEntry({
      id: 'entry-high',
      shortcut: 'Schema drift candidate',
      latestSubmission: {
        id: 'candidate-ingestion',
        revision: 1,
        submittedAt: '2026-06-03T10:00:00.000Z',
        submittedBy: actor,
        lifecycleState: 'submitted',
        resubmissionOf: null,
        agentReview: null,
        reviewerDecision: null,
        reviewNotes: [],
      },
      agentReview: {
        status: 'agent-rejected',
        duplicateRisk: 'high',
        correctnessRisk: 'high',
        completenessRisk: 'high',
        checkedAt: '2026-06-03T10:00:00.000Z',
        notes: [],
      },
    });
    const medium = createQueueEntry({
      id: 'entry-medium',
      shortcut: 'Network policy candidate',
      createdAt: '2026-06-02T10:00:00.000Z',
      agentReview: {
        status: 'agent-pass',
        duplicateRisk: 'medium',
        correctnessRisk: 'medium',
        completenessRisk: 'low',
        checkedAt: '2026-06-02T10:00:00.000Z',
        notes: [],
      },
    });
    const unrelated = createQueueEntry({ id: 'entry-unrelated', shortcut: 'Unrelated' });

    const result = applyReviewQueueQuery(
      [unrelated, medium, high],
      createQuery({ search: 'candidate' }),
    );

    expect(result.total).toBe(3);
    expect(result.filteredTotal).toBe(2);
    expect(result.items.map((entry) => entry.id)).toEqual(['entry-high', 'entry-medium']);
  });

  it('supports search, source, risk level, and age sorting', () => {
    const oldSubmission = {
      ...createQueueEntry().latestSubmission!,
      submittedAt: '2026-05-01T10:00:00.000Z',
    };
    const newSubmission = {
      ...createQueueEntry().latestSubmission!,
      submittedAt: '2026-06-04T10:00:00.000Z',
    };
    const old = createQueueEntry({
      id: 'entry-old',
      createdAt: '2026-05-01T10:00:00.000Z',
      latestSubmission: oldSubmission,
    });
    const newer = createQueueEntry({
      id: 'entry-newer',
      createdAt: '2026-06-04T10:00:00.000Z',
      latestSubmission: newSubmission,
    });
    const approved = createQueueEntry({ id: 'entry-approved', lifecycleState: 'approved' });
    const entries = [old, newer, approved];

    expect(
      applyReviewQueueQuery(entries, createQuery({ search: 'network', sort: 'highest-risk' }))
        .filteredTotal,
    ).toBe(0);
    expect(
      applyReviewQueueQuery(
        entries,
        createQuery({ source: 'source-1', sort: 'oldest', limit: 3 }),
      ).items.map((entry) => entry.id),
    ).toEqual(['entry-old', 'entry-approved', 'entry-newer']);
    expect(
      applyReviewQueueQuery(entries, createQuery({ riskLevel: 'high', sort: 'newest' }))
        .filteredTotal,
    ).toBe(0);
    expect(
      applyReviewQueueQuery(
        entries,
        createQuery({ status: 'submitted', sort: 'oldest', limit: 3 }),
      ).items.map((entry) => entry.id),
    ).toEqual(['entry-old', 'entry-newer']);
  });

  it('pages after filtering and emits the next opaque offset cursor', () => {
    const entries = [
      createQueueEntry({ id: 'entry-1' }),
      createQueueEntry({ id: 'entry-2', createdAt: '2026-06-02T10:00:00.000Z' }),
      createQueueEntry({ id: 'entry-3', createdAt: '2026-06-03T10:00:00.000Z' }),
    ];

    const first = applyReviewQueueQuery(entries, createQuery({ limit: 2 }));
    expect(first.items.map((entry) => entry.id)).toEqual(['entry-1', 'entry-2']);
    expect(first.filteredTotal).toBe(3);

    const second = applyReviewQueueQuery(entries, createQuery({ cursor: '2', limit: 2 }));
    expect(second.items.map((entry) => entry.id)).toEqual(['entry-3']);
  });

  it('rejects malformed cursors instead of silently restarting pagination', () => {
    expect(() => decodeReviewQueueOffset('not-a-cursor')).toThrow('Invalid review queue cursor');
  });
});
