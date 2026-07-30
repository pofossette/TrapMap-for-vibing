import { describe, expect, it, vi } from 'vitest';

import type {
  LegacyArtifactSnapshotOwner,
  LegacyArtifactSnapshotRecord,
} from './wave9-artifact-backfill.js';
import { migrateLegacySkillArtifacts } from './wave9-artifact-backfill.js';

const artifact: LegacyArtifactSnapshotRecord = {
  id: 'artifact_legacy_1',
  teamId: null,
  scope: 'global',
  labels: ['legacy'],
  title: 'Legacy skill artifact',
  slug: 'legacy-skill-artifact',
  requiredLevel: 2,
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
  lifecycleHistory: [],
  boundary: null,
  decayMeta: null,
  evidenceMeta: null,
  maintenanceMeta: null,
  remediation: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

function createOwner(): LegacyArtifactSnapshotOwner {
  const records = new Map<string, LegacyArtifactSnapshotRecord>();
  return {
    put: vi.fn(async (record) => {
      records.set(record.id, record);
    }),
    get: vi.fn(async (recordId) => records.get(recordId) ?? null),
  };
}

describe('Wave-9 legacy artifact backfill', () => {
  it('preserves the legacy aggregate verbatim and verifies an idempotent rerun', async () => {
    const owner = createOwner();

    const first = await migrateLegacySkillArtifacts({ owner, records: [artifact] });

    expect(first).toEqual({
      totalArtifacts: 1,
      migrated: 1,
      skipped: 0,
      verified: 1,
      errors: [],
      durationMs: expect.any(Number),
    });
    await expect(owner.get(artifact.id)).resolves.toEqual(artifact);

    const second = await migrateLegacySkillArtifacts({ owner, records: [artifact] });

    expect(second).toEqual({
      totalArtifacts: 1,
      migrated: 0,
      skipped: 1,
      verified: 1,
      errors: [],
      durationMs: expect.any(Number),
    });
    expect(owner.put).toHaveBeenCalledTimes(1);
  });

  it('rejects a same-ID destination whose legacy aggregate differs', async () => {
    const owner = createOwner();
    await owner.put({
      ...artifact,
      title: 'Tampered legacy artifact',
    });
    owner.put.mockClear();

    const result = await migrateLegacySkillArtifacts({ owner, records: [artifact] });

    expect(result).toEqual({
      totalArtifacts: 1,
      migrated: 0,
      skipped: 0,
      verified: 0,
      errors: [
        {
          artifactId: artifact.id,
          error: 'destination artifact differs from snapshot',
        },
      ],
      durationMs: expect.any(Number),
    });
    expect(owner.put).not.toHaveBeenCalled();
    await expect(owner.get(artifact.id)).resolves.toEqual({
      ...artifact,
      title: 'Tampered legacy artifact',
    });
  });

  it('records a write-then-mismatch failure without masking the destination', async () => {
    const owner = createOwner();
    owner.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...artifact, slug: 'tampered-slug' });

    const result = await migrateLegacySkillArtifacts({ owner, records: [artifact] });

    expect(result).toEqual({
      totalArtifacts: 1,
      migrated: 1,
      skipped: 0,
      verified: 0,
      errors: [
        {
          artifactId: artifact.id,
          error: 'destination artifact differs from snapshot after write',
        },
      ],
      durationMs: expect.any(Number),
    });
  });
});
