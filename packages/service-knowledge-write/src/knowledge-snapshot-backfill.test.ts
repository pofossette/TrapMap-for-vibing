import { describe, expect, it, vi } from 'vitest';

import {
  migrateKnowledgeSnapshot,
  type KnowledgeSnapshotOwner,
  type LegacyKnowledgeSnapshotRecord,
} from './knowledge-snapshot-backfill.js';

const knowledge: LegacyKnowledgeSnapshotRecord = {
  id: 'knowledge_legacy_1',
  teamId: 'team_1',
  scope: 'project',
  labels: ['legacy', 'migration'],
  shortcut: 'Retain complete knowledge history',
  detail: 'The legacy record must survive the snapshot cutover.',
  requiredLevel: 2,
  lifecycleState: 'approved',
  ownerUserId: 'user_1',
  latestRevision: {
    revision: 2,
    submittedAt: '2026-07-21T00:10:00.000Z',
    submittedByUserId: 'user_1',
    shortcut: 'Retain complete knowledge history',
    detail: 'The legacy record must survive the snapshot cutover.',
    labels: ['legacy', 'migration'],
    reviewNotes: [],
  },
  history: [],
  metadata: {
    scopeLabel: 'project-knowledge',
    submissionCount: 2,
    resubmissionCount: 1,
    revisionCount: 2,
    latestSubmissionId: 'submission_2',
    latestSubmittedAt: '2026-07-21T00:10:00.000Z',
    latestReviewedAt: '2026-07-21T00:20:00.000Z',
    latestDecision: 'approve',
  },
  latestSubmissionId: 'submission_2',
  submissionHistory: [
    {
      id: 'submission_2',
      revision: 2,
      submittedAt: '2026-07-21T00:10:00.000Z',
      submittedByUserId: 'user_1',
      lifecycleState: 'approved',
      resubmissionOf: 'submission_1',
      agentReview: null,
      reviewerDecision: {
        decidedAt: '2026-07-21T00:20:00.000Z',
        decidedByUserId: 'reviewer_1',
        decision: 'approve',
        notes: 'Complete.',
      },
      reviewNotes: [],
    },
  ],
  agentReview: null,
  reviewHistory: [
    {
      decidedAt: '2026-07-21T00:20:00.000Z',
      decidedByUserId: 'reviewer_1',
      decision: 'approve',
      notes: 'Complete.',
    },
  ],
  reviewNotes: [],
  lifecycleHistory: [
    {
      id: 'lifecycle_1',
      type: 'reviewer-approved',
      createdAt: '2026-07-21T00:20:00.000Z',
      actorUserId: 'reviewer_1',
      submissionId: 'submission_2',
      revision: 2,
      state: 'approved',
      note: 'Complete.',
    },
  ],
  embeddingCache: null,
  indexState: { indexedAt: '2026-07-21T00:21:00.000Z' },
  boundary: null,
  decayMeta: null,
  evidenceMeta: null,
  maintenanceMeta: null,
  remediation: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:20:00.000Z',
};

function createOwner(): KnowledgeSnapshotOwner {
  const records = new Map<string, LegacyKnowledgeSnapshotRecord>();
  return {
    put: vi.fn(async (record) => records.set(record.id, record)),
    get: vi.fn(async (recordId) => records.get(recordId) ?? null),
  };
}

describe('knowledge legacy snapshot backfill', () => {
  it('preserves the complete aggregate and verifies an idempotent rerun', async () => {
    const owner = createOwner();

    await expect(migrateKnowledgeSnapshot({ owner, records: [knowledge] })).resolves.toEqual({
      migrated: 1,
      skipped: 0,
      verified: 1,
      errors: [],
    });
    await expect(migrateKnowledgeSnapshot({ owner, records: [knowledge] })).resolves.toEqual({
      migrated: 0,
      skipped: 1,
      verified: 1,
      errors: [],
    });
  });

  it('refuses a destination record with the same id but different history', async () => {
    const owner = createOwner();
    await owner.put({ ...knowledge, history: [knowledge.latestRevision] });

    await expect(migrateKnowledgeSnapshot({ owner, records: [knowledge] })).resolves.toEqual({
      migrated: 0,
      skipped: 0,
      verified: 0,
      errors: [
        {
          recordId: knowledge.id,
          error: 'destination record differs from snapshot',
        },
      ],
    });
  });
});
