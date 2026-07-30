import { describe, expect, it, vi } from 'vitest';

import type { LegacyArtifactSnapshotRecord } from './wave9-artifact-backfill.js';
import { createArtifactSnapshotOwner } from './wave9-artifact-snapshot-owner.js';
import { createTransactionPool } from './test-helpers.js';

const record: LegacyArtifactSnapshotRecord = {
  id: 'artifact_legacy_1',
  teamId: null,
  scope: 'global',
  labels: ['legacy'],
  title: 'Legacy skill artifact',
  slug: 'legacy-skill-artifact',
  requiredLevel: 0,
  lifecycleState: 'approved',
  ownerUserId: 'user_1',
  latestRevision: {
    revision: 1,
    sourceHash: 'a'.repeat(64),
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256: 'a'.repeat(64),
        sizeBytes: 24,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
      },
    ],
    submittedAt: '2026-07-21T00:00:00.000Z',
    submittedByUserId: 'user_1',
    scriptDescriptors: [],
    derived: null,
  },
  history: [],
  metadata: {
    sourceKind: 'skill-directory',
    submissionCount: 1,
    resubmissionCount: 0,
    revisionCount: 1,
    latestSubmissionId: null,
    latestSubmittedAt: '2026-07-21T00:00:00.000Z',
    latestReviewedAt: null,
    latestDecision: null,
  },
  agentReview: null,
  reviewHistory: [],
  reviewNotes: [],
  lifecycleHistory: [
    {
      id: 'artifact_event_1',
      type: 'submitted',
      createdAt: '2026-07-21T00:00:00.000Z',
      actorUserId: 'user_1',
      submissionId: null,
      revision: 1,
      state: 'submitted',
      note: 'Legacy artifact submitted',
    },
  ],
  boundary: null,
  decayMeta: null,
  evidenceMeta: null,
  maintenanceMeta: null,
  remediation: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

describe('artifact snapshot PostgreSQL owner', () => {
  it('writes canonical aggregates and stores an exact owner-local migration payload', async () => {
    const { calls, client, pool } = createTransactionPool(() => ({ rows: [] }));
    const owner = createArtifactSnapshotOwner(pool as never);

    await owner.put(record);

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('INSERT INTO skill_artifacts'),
        expect.stringContaining('INSERT INTO artifact_revisions'),
        expect.stringContaining('INSERT INTO artifact_lifecycle_events'),
        'COMMIT',
      ]),
    );
    const entryCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO skill_artifacts'),
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
    const owner = createArtifactSnapshotOwner({ query } as never);

    await expect(owner.get(record.id)).resolves.toEqual(record);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT metadata FROM skill_artifacts'),
      [record.id],
    );
  });

  it('returns null when the artifact is absent', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const owner = createArtifactSnapshotOwner({ query } as never);

    await expect(owner.get(record.id)).resolves.toBeNull();
  });
});
