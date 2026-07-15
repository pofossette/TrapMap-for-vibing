import type { SkillArtifact } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createArtifactWritePort } from './artifact-ports.js';

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
    lifecycleHistory: [],
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
  it('persists an imported artifact and its revision in one owner transaction', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const port = createArtifactWritePort({
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    } as never);

    await port.insert(artifactFixture());

    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('INSERT INTO skill_artifacts'),
        expect.stringContaining('INSERT INTO artifact_revisions'),
        'COMMIT',
      ]),
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back an artifact import when revision persistence fails', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes('INSERT INTO artifact_revisions')) throw new Error('revision unavailable');
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const port = createArtifactWritePort({
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    } as never);

    await expect(port.insert(artifactFixture())).rejects.toThrow('revision unavailable');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
