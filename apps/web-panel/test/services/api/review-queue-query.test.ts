import type { ReviewQueueItem } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import { applyReviewQueueQuery } from '../../../src/services/api/review-queue-query';

const actor = { id: 'actor-1', handle: 'reviewer', securityLevel: 5 };

function createItem(
  id: string,
  risks: ['low' | 'medium' | 'high', 'low' | 'medium' | 'high', 'low' | 'medium' | 'high'],
): ReviewQueueItem {
  const agentReview = {
    status: 'agent-pass' as const,
    duplicateRisk: risks[2],
    correctnessRisk: risks[1],
    completenessRisk: risks[0],
    checkedAt: '2026-06-01T10:00:00.000Z',
    notes: [],
  };

  return {
    entry: {
      id,
      teamId: null,
      scope: 'project',
      labels: [],
      shortcut: `${id} title`,
      detail: `${id} detail`,
      requiredLevel: 1,
      lifecycleState: 'submitted',
      owner: actor,
      latestRevision: {
        revision: 1,
        submittedAt: '2026-06-01T10:00:00.000Z',
        submittedBy: actor,
        shortcut: id,
        detail: id,
        labels: [],
        reviewNotes: [],
      },
      history: [],
      metadata: {
        scopeLabel: 'project-knowledge',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: `source-${id}`,
        latestSubmittedAt: '2026-06-01T10:00:00.000Z',
        latestReviewedAt: null,
        latestDecision: null,
      },
      latestSubmission: {
        id: `source-${id}`,
        revision: 1,
        submittedAt: '2026-06-01T10:00:00.000Z',
        submittedBy: actor,
        lifecycleState: 'submitted',
        resubmissionOf: null,
        agentReview: null,
        reviewerDecision: null,
        reviewNotes: [],
      },
      submissionHistory: [],
      agentReview,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      boundary: null,
      evidenceMeta: null,
      maintenanceMeta: null,
      remediation: null,
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
    },
    agentReview,
    submittedBy: actor,
    lastDecision: null,
    latestSubmission: null,
    reviewNotes: [],
  };
}

describe('mock review queue query seam', () => {
  it('applies server-side filters, sorting, counts, and cursor paging', () => {
    const high = createItem('high', ['high', 'high', 'high']);
    const low = createItem('low', ['high', 'high', 'medium']);

    const result = applyReviewQueueQuery([low, high], {
      filters: {
        status: 'all',
        search: '',
        source: 'all',
        riskLevel: 'high',
        sort: 'highest-risk',
      },
      paging: { cursor: undefined, limit: 1 },
    });

    expect(result.items.map((item) => item.entry.id)).toEqual(['high']);
    expect(result.filteredTotal).toBe(2);
    // The second high-risk item is on the next filtered page.
    expect(result.nextCursor).toBe('1');
    expect(result.total).toBe(2);
  });
});
