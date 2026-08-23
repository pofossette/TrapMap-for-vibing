import type { KnowledgeEntry, KnowledgeOwnerPort } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildOwnerReviewQueueProjection,
  buildReviewQueueProjection,
} from './review-queue-projection.js';

function createKnowledgeEntryRecord() {
  return {
    id: 'entry-1',
    teamId: 'team-1',
    scope: 'project' as const,
    labels: ['ops'],
    shortcut: 'review-item',
    detail: 'Needs review',
    requiredLevel: 3,
    lifecycleState: 'submitted' as const,
    ownerUserId: 'owner-1',
    latestRevision: {
      revision: 1,
      submittedAt: '2026-06-30T10:00:00.000Z',
      submittedByUserId: 'owner-1',
      shortcut: 'review-item',
      detail: 'Needs review',
      labels: ['ops'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: '2026-06-30T10:00:00.000Z',
        submittedByUserId: 'owner-1',
        shortcut: 'review-item',
        detail: 'Needs review',
        labels: ['ops'],
        reviewNotes: [],
      },
    ],
    metadata: {
      scopeLabel: 'project-knowledge' as const,
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: '2026-06-30T10:00:00.000Z',
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: 'sub-1',
    submissionHistory: [
      {
        id: 'sub-1',
        revision: 1,
        submittedAt: '2026-06-30T10:00:00.000Z',
        submittedByUserId: 'owner-1',
        lifecycleState: 'submitted' as const,
        resubmissionOf: null,
        agentReview: {
          status: 'agent-pass' as const,
          duplicateRisk: 'low' as const,
          correctnessRisk: 'low' as const,
          completenessRisk: 'medium' as const,
          checkedAt: '2026-06-30T10:01:00.000Z',
          notes: ['looks good'],
        },
        reviewerDecision: null,
        reviewNotes: [],
      },
    ],
    agentReview: {
      status: 'agent-pass' as const,
      duplicateRisk: 'low' as const,
      correctnessRisk: 'low' as const,
      completenessRisk: 'medium' as const,
      checkedAt: '2026-06-30T10:01:00.000Z',
      notes: ['looks good'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
    createdAt: '2026-06-30T10:00:00.000Z',
    updatedAt: '2026-06-30T10:01:00.000Z',
  };
}

describe('buildReviewQueueProjection', () => {
  it('builds queue items from the normalized knowledge owner port', async () => {
    const raw = createKnowledgeEntryRecord();
    const owner = { id: 'owner-1', handle: 'owner', securityLevel: 7 };
    const entry = {
      ...raw,
      owner,
      latestRevision: { ...raw.latestRevision, submittedBy: owner, reviewNotes: [] },
      history: raw.history.map((revision) => ({
        ...revision,
        submittedBy: owner,
        reviewNotes: [],
      })),
      latestSubmission: {
        ...raw.submissionHistory[0]!,
        submittedBy: owner,
        reviewerDecision: null,
        reviewNotes: [],
      },
      submissionHistory: raw.submissionHistory.map((submission) => ({
        ...submission,
        submittedBy: owner,
        reviewerDecision: null,
        reviewNotes: [],
      })),
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
    } as KnowledgeEntry;
    const knowledge: Pick<KnowledgeOwnerPort, 'listByFilter'> = {
      async listByFilter() {
        return { items: [entry], total: 1 };
      },
    };

    const projection = await buildOwnerReviewQueueProjection(knowledge, {
      auth: {
        subjectType: 'user',
        activeTeamId: 'team-1',
        securityLevel: 9,
      },
    });

    expect(projection).toEqual({
      items: [
        {
          entry,
          agentReview: entry.agentReview,
          submittedBy: owner,
          latestSubmission: entry.latestSubmission,
          reviewNotes: [],
          lastDecision: null,
        },
      ],
      filteredTotal: 1,
      nextCursor: null,
      total: 1,
    });
  });

  it('applies the shared queue query before shaping owner items', async () => {
    const raw = createKnowledgeEntryRecord();
    const owner = { id: 'owner-1', handle: 'owner', securityLevel: 7 };
    const entry = {
      ...raw,
      owner,
      latestRevision: { ...raw.latestRevision, submittedBy: owner, reviewNotes: [] },
      history: raw.history.map((revision) => ({
        ...revision,
        submittedBy: owner,
        reviewNotes: [],
      })),
      latestSubmission: {
        ...raw.submissionHistory[0]!,
        submittedBy: owner,
        reviewerDecision: null,
        reviewNotes: [],
      },
      submissionHistory: raw.submissionHistory.map((submission) => ({
        ...submission,
        submittedBy: owner,
        reviewerDecision: null,
        reviewNotes: [],
      })),
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
    } as KnowledgeEntry;
    const knowledge: Pick<KnowledgeOwnerPort, 'listByFilter'> = {
      async listByFilter() {
        return { items: [entry], total: 1 };
      },
    };

    const projection = await buildOwnerReviewQueueProjection(knowledge, {
      auth: { subjectType: 'user', activeTeamId: 'team-1', securityLevel: 9 },
      query: { cursor: undefined, limit: 10, search: 'does-not-match', sort: 'highest-risk' },
    });

    expect(projection).toEqual({
      items: [],
      filteredTotal: 0,
      nextCursor: null,
      total: 1,
    });
  });

  it('builds governance review queue items without server package helpers', async () => {
    const entry = createKnowledgeEntryRecord();
    const repos = {
      knowledge: {
        async listByFilter() {
          return [entry];
        },
        async getById(entryId: string) {
          return entryId === entry.id ? entry : null;
        },
      },
      user: {
        async getById(userId: string) {
          if (userId === 'owner-1') {
            return { id: 'owner-1', handle: 'owner', createdAt: '', updatedAt: '' };
          }
          return null;
        },
      },
      membership: {
        async findByUserAndTeam(userId: string, teamId: string) {
          if (userId === 'owner-1' && teamId === 'team-1') {
            return { userId, teamId, securityLevel: 7 };
          }
          return null;
        },
        async listByUser() {
          return [];
        },
      },
    };

    const projection = await buildReviewQueueProjection(repos, {
      auth: {
        subjectType: 'user',
        activeTeamId: 'team-1',
        securityLevel: 9,
      },
    });

    expect(projection.total).toBe(1);
    expect(projection.items[0]).toMatchObject({
      submittedBy: {
        id: 'owner-1',
        handle: 'owner',
        securityLevel: 7,
      },
      agentReview: {
        status: 'agent-pass',
      },
      latestSubmission: {
        id: 'sub-1',
      },
      reviewNotes: [],
      entry: {
        id: 'entry-1',
        owner: {
          id: 'owner-1',
          handle: 'owner',
          securityLevel: 7,
        },
      },
    });
  });
});
