import { describe, expect, it, vi } from 'vitest';

import type { LegacyKnowledgeSnapshotRecord } from './knowledge-snapshot-backfill.js';
import { createKnowledgeSnapshotOwner } from './knowledge-snapshot-owner.js';
import { createTransactionPool } from './test-helpers.js';

const record: LegacyKnowledgeSnapshotRecord = {
  id: 'knowledge_legacy_1',
  teamId: null,
  scope: 'global',
  labels: ['legacy'],
  shortcut: 'Legacy knowledge',
  detail: 'Preserve all fields.',
  requiredLevel: 0,
  lifecycleState: 'approved',
  ownerUserId: 'user_1',
  latestRevision: {
    revision: 1,
    submittedAt: '2026-07-21T00:00:00.000Z',
    submittedByUserId: 'user_1',
    shortcut: 'Legacy knowledge',
    detail: 'Preserve all fields.',
    labels: ['legacy'],
    reviewNotes: [],
  },
  history: [],
  metadata: {
    scopeLabel: 'global-constraint',
    submissionCount: 1,
    resubmissionCount: 0,
    revisionCount: 1,
    latestSubmissionId: null,
    latestSubmittedAt: null,
    latestReviewedAt: null,
    latestDecision: null,
  },
  latestSubmissionId: null,
  submissionHistory: [],
  agentReview: null,
  reviewHistory: [],
  reviewNotes: [],
  lifecycleHistory: [],
  embeddingCache: null,
  indexState: null,
  boundary: null,
  decayMeta: null,
  evidenceMeta: null,
  maintenanceMeta: null,
  remediation: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

describe('knowledge snapshot PostgreSQL owner', () => {
  it('writes canonical aggregates and stores an exact owner-local migration payload', async () => {
    const { calls, client, pool } = createTransactionPool(() => ({ rows: [] }));
    const owner = createKnowledgeSnapshotOwner(pool as never);

    await owner.put(record);

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('INSERT INTO knowledge_entries'),
        expect.stringContaining('INSERT INTO knowledge_revisions'),
        expect.stringContaining('COMMIT'),
      ]),
    );
    const entryCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO knowledge_entries'),
    );
    expect(entryCall?.[1]).toEqual(
      expect.arrayContaining([expect.stringContaining('legacySnapshotRecord')]),
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('reads the exact migration payload from the owner table', async () => {
    const query = vi.fn(async () => ({
      rows: [{ metadata: { ...record.metadata, legacySnapshotRecord: record } }],
    }));
    const owner = createKnowledgeSnapshotOwner({ query } as never);

    await expect(owner.get(record.id)).resolves.toEqual(record);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT metadata FROM knowledge_entries'),
      [record.id],
    );
  });
});
