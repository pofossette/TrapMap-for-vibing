import type { ArtifactBundle, SkillArtifact } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  createArtifactBundleImportPort,
  createArtifactFilePayloadOwner,
  createArtifactReadProjection,
  createArtifactWritePort,
} from '../src/artifact-ports.js';
import { createTransactionPool } from '../src/test-helpers.js';

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

function bundleFixture(): ArtifactBundle {
  return {
    scope: 'project',
    labels: ['owner-local'],
    title: 'Owner-local bundle',
    slug: 'owner-local-bundle',
    requiredLevel: 1,
    sourceKind: 'skill-directory',
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256: 'a'.repeat(64),
        sizeBytes: 12,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
        content: '---\nname: x\n---',
      },
    ],
    scriptDescriptors: [],
  };
}

describe('ArtifactWritePort', () => {
  it('exposes only artifact mutation operations', () => {
    const port = createArtifactWritePort({
      connect: vi.fn(),
      query: vi.fn(),
    });

    expect(Object.keys(port).sort()).toEqual(
      [
        'activate',
        'appendLifecycleEvent',
        'appendRevision',
        'editArtifact',
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
    const port = createArtifactWritePort(pool);

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
    const port = createArtifactWritePort(pool);

    await expect(port.insert(artifactFixture())).rejects.toThrow('revision unavailable');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe('ArtifactBundleImportPort', () => {
  it('persists a normalized bundle and its payloads in one owner transaction', async () => {
    const { calls, client, pool } = createTransactionPool(() => ({ rows: [] }));
    const importer = createArtifactBundleImportPort(pool);

    const artifact = await importer.importBundle(bundleFixture(), {
      actorId: 'owner-1',
      teamId: 'team-1',
      handle: 'owner',
      securityLevel: 4,
    });

    expect(artifact).toMatchObject({
      teamId: 'team-1',
      lifecycleState: 'submitted',
      latestRevision: 1,
      metadata: expect.objectContaining({ sourceKind: 'skill-directory' }),
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        'BEGIN',
        expect.stringContaining('INSERT INTO skill_artifacts'),
        expect.stringContaining('INSERT INTO artifact_revisions'),
        expect.stringContaining('INSERT INTO artifact_lifecycle_events'),
        expect.stringContaining('INSERT INTO skill_artifact_files'),
        'COMMIT',
      ]),
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('maps SKILL.md frontmatter version into the revision', async () => {
    const { pool } = createTransactionPool(() => ({ rows: [] }));
    const importer = createArtifactBundleImportPort(pool);
    const bundle = bundleFixture();
    bundle.files[0]!.content = '---\nname: x\nversion: 1.0.0\n---';

    const artifact = await importer.importBundle(bundle, {
      actorId: 'owner-1',
      teamId: null,
      handle: 'owner',
      securityLevel: 4,
    });

    expect(artifact.history[0]?.version).toBe('1.0.0');
  });

  it('omits version when SKILL.md frontmatter has none', async () => {
    const { pool } = createTransactionPool(() => ({ rows: [] }));
    const importer = createArtifactBundleImportPort(pool);

    const artifact = await importer.importBundle(bundleFixture(), {
      actorId: 'owner-1',
      teamId: null,
      handle: 'owner',
      securityLevel: 4,
    });

    expect(artifact.history[0]?.version).toBeUndefined();
  });

  it('persists the revision version column when present', async () => {
    const recorded: Array<[string, unknown[]?]> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        recorded.push([sql, values]);
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn(async () => ({ rows: [] })),
    };
    const importer = createArtifactBundleImportPort(pool);
    const bundle = bundleFixture();
    bundle.files[0]!.content = '---\nname: x\nversion: 2.3.4\n---';

    await importer.importBundle(bundle, {
      actorId: 'owner-1',
      teamId: null,
      handle: 'owner',
      securityLevel: 4,
    });

    const insert = recorded.find(([sql]) => sql.includes('INSERT INTO artifact_revisions'));
    expect(insert?.[0]).toContain(' version,');
    expect(insert?.[1]).toContain('2.3.4');
  });

  it('rejects traversal paths before opening an owner transaction', async () => {
    const { client, pool } = createTransactionPool(() => ({ rows: [] }));
    const importer = createArtifactBundleImportPort(pool);
    const bundle = bundleFixture();
    bundle.files[0]!.path = '../outside.md';

    await expect(
      importer.importBundle(bundle, {
        actorId: 'owner-1',
        teamId: null,
        handle: 'owner',
        securityLevel: 4,
      }),
    ).rejects.toThrow('Invalid file path');

    expect(client.query).not.toHaveBeenCalled();
    expect(client.release).not.toHaveBeenCalled();
  });
});

describe('ArtifactFilePayloadOwner', () => {
  it('uses the revision file metadata when persisting legacy payload content', async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (sql.includes('FROM artifact_revisions')) {
          return {
            rows: [
              {
                files: [
                  {
                    path: 'references/setup.md',
                    kind: 'reference',
                    source: 'references/',
                    includeInDerivation: true,
                    activationOnly: false,
                  },
                ],
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const owner = createArtifactFilePayloadOwner(pool);

    await owner.put({
      artifactId: 'artifact-1',
      revision: 1,
      path: 'references/setup.md',
      sha256: 'a'.repeat(64),
      sizeBytes: 3,
      mediaType: 'text/markdown',
      content: 'one',
      storedAt: '2026-07-22T00:00:00.000Z',
    });

    const insert = calls.find(({ sql }) => sql.includes('INSERT INTO skill_artifact_files'));
    expect(insert?.values).toEqual(expect.arrayContaining(['reference', 'references/', 1, 0]));
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

    const projection = createArtifactReadProjection({ query });

    await expect(projection.getById('artifact-1')).resolves.toEqual(
      expect.objectContaining({ requiredLevel: 8 }),
    );
  });

  it('maps the revision version column when present and omits it when absent', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM skill_artifacts')) {
        return {
          rows: [
            {
              id: 'artifact-1',
              team_id: null,
              required_level: 1,
              lifecycle_state: 'approved',
              owner_user_id: 'owner-1',
              labels: [],
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
              version: '3.2.1',
              submitted_at: artifactFixture().createdAt,
              submitted_by_user_id: 'owner-1',
            },
            {
              revision_no: 2,
              source_hash: 'source-hash-2',
              files: [],
              script_descriptors: [],
              derived: null,
              version: null,
              submitted_at: artifactFixture().createdAt,
              submitted_by_user_id: 'owner-1',
            },
          ],
        };
      }
      return { rows: [] };
    });

    const projection = createArtifactReadProjection({ query });

    const artifact = await projection.getById('artifact-1');
    expect(artifact?.history[0]?.version).toBe('3.2.1');
    expect(artifact?.history[1]?.version).toBeUndefined();
  });

  it('reads the owner-local artifact indexing projection', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM skill_artifacts')) {
        return {
          rows: [
            {
              id: 'artifact-1',
              team_id: null,
              scope: 'global',
              labels: ['docker'],
              title: 'Docker recovery',
              slug: 'docker-recovery',
              required_level: 0,
              lifecycle_state: 'approved',
              owner_user_id: 'owner-1',
              metadata: {},
              created_at: '2026-07-25T00:00:00.000Z',
              updated_at: '2026-07-25T00:00:00.000Z',
            },
          ],
        };
      }
      if (sql.includes('FROM artifact_revisions')) {
        return {
          rows: [
            {
              revision_no: 2,
              source_hash: 'source-hash',
              files: [],
              script_descriptors: [],
              derived: { profile: null, capsules: [], clientManifest: null },
              submitted_at: '2026-07-25T00:00:00.000Z',
              submitted_by_user_id: 'owner-1',
            },
          ],
        };
      }
      return { rows: [] };
    });
    const projection = createArtifactReadProjection({ query });

    await expect(projection.getIndexingEntry('artifact-1')).resolves.toMatchObject({
      id: 'artifact-1',
      lifecycleState: 'approved',
      revision: 2,
      derived: { capsules: [] },
    });
  });

  it('pages owner-local artifact indexing projections', async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('FROM skill_artifacts')) {
        expect(values).toEqual([1, 3]);
        return {
          rows: [
            {
              id: 'artifact-1',
              team_id: null,
              scope: 'global',
              labels: [],
              title: 'One',
              required_level: 0,
              lifecycle_state: 'approved',
              revision_no: 3,
              derived: { profile: null, capsules: [], clientManifest: null },
            },
            {
              id: 'artifact-2',
              team_id: null,
              scope: 'global',
              labels: [],
              title: 'Two',
              required_level: 0,
              lifecycle_state: 'submitted',
              revision_no: 1,
              derived: null,
            },
            {
              id: 'artifact-3',
              team_id: null,
              scope: 'global',
              labels: [],
              title: 'Three',
              required_level: 0,
              lifecycle_state: 'approved',
              revision_no: 4,
              derived: { profile: null, capsules: [], clientManifest: null },
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      createArtifactReadProjection({ query }).listIndexingEntries({ offset: 1, limit: 2 }),
    ).resolves.toEqual({
      entries: [
        expect.objectContaining({ id: 'artifact-1', revision: 3 }),
        expect.objectContaining({ id: 'artifact-2', revision: 1 }),
      ],
      nextOffset: 3,
    });
  });
});
