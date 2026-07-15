import type { SkillArtifact } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createArtifactReadProjection, createArtifactWritePort } from './artifact-ports.js';
import { createTransactionPool } from './test-helpers.js';

function artifactFixture(): SkillArtifact {
  return {
    id: 'artifact-1',
    teamId: null,
    scope: 'global',
    labels: ['owner-local'],
    title: 'Owner-local artifact',
    slug: 'owner-local-artifact',
    requiredLevel: 1,
    lifecycleState: 'submitted',
    owner: { id: 'owner-1', handle: 'owner', securityLevel: 1 },
    latestRevision: 1,
    history: [
      {
        revision: 1,
        sourceHash: 'source-hash',
        files: [],
        scriptDescriptors: [],
        derived: null,
        submittedAt: '2026-07-14T00:00:00.000Z',
        submittedBy: { id: 'owner-1', handle: 'owner', securityLevel: 1 },
      },
    ],
    lifecycleHistory: [
      {
        id: 'artifact-event-1',
        type: 'submitted',
        createdAt: '2026-07-14T00:00:00.000Z',
        actor: { id: 'owner-1', handle: 'owner', securityLevel: 1 },
        submissionId: 'submission-1',
        revision: 1,
        state: 'submitted',
        note: 'ready for review',
      },
    ],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    maintenanceMeta: {
      maintainerUserId: 'maintainer-1',
      maintainerHandle: 'maintainer',
      maintainerLevel: 2,
      reviewBy: '2026-08-01T00:00:00.000Z',
    },
    boundaryMeta: null,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

describe('ArtifactWritePort', () => {
  it('exposes only artifact mutation operations', () => {
    const port = createArtifactWritePort({
      connect: vi.fn(),
      query: vi.fn(),
    } as never);

    expect(Object.keys(port).sort()).toEqual(
      [
        'activate',
        'appendLifecycleEvent',
        'appendRevision',
        'editArtifact',
        'importArtifact',
        'insert',
        'nextId',
        'review',
        'updateLifecycle',
        'updateRevisionDerived',
      ].sort(),
    );
  });

  it('persists an imported artifact and its revision in one owner transaction', async () => {
    const { calls, client, pool } = createTransactionPool(() => ({ rows: [] }));
    const port = createArtifactWritePort(pool as never);

    await port.insert(artifactFixture());

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('INSERT INTO skill_artifacts'),
        expect.stringContaining('INSERT INTO artifact_revisions'),
        expect.stringContaining('INSERT INTO artifact_lifecycle_events'),
        'COMMIT',
      ]),
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back an artifact import when revision persistence fails', async () => {
    const { calls, client, pool } = createTransactionPool((sql) => {
      if (sql.includes('INSERT INTO artifact_revisions')) throw new Error('revision unavailable');
      return { rows: [] };
    });
    const port = createArtifactWritePort(pool as never);

    await expect(port.insert(artifactFixture())).rejects.toThrow('revision unavailable');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe('ArtifactReadProjection', () => {
  it('maps PostgreSQL required_level into the public artifact contract', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM skill_artifacts')) {
        return {
          rows: [
            {
              id: 'artifact-1',
              team_id: null,
              required_level: 8,
              lifecycle_state: 'approved',
              owner_user_id: 'owner-1',
              labels: ['security'],
              metadata: artifactFixture().metadata,
              created_at: artifactFixture().createdAt,
              updated_at: artifactFixture().updatedAt,
            },
          ],
        };
      }
      if (sql.includes('FROM artifact_revisions')) {
        return {
          rows: [
            {
              revision_no: 1,
              source_hash: 'source-hash',
              files: [],
              script_descriptors: [],
              derived: null,
              submitted_at: artifactFixture().createdAt,
              submitted_by_user_id: 'owner-1',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const projection = createArtifactReadProjection({ query } as never);

    await expect(projection.getById('artifact-1')).resolves.toEqual(
      expect.objectContaining({ requiredLevel: 8 }),
    );
  });
});
