import { describe, expect, it, vi } from 'vitest';

import {
  createLegacySnapshotSource,
  loadLegacySnapshot,
  type LegacySnapshotSource,
} from './source.js';

const timestamp = '2026-07-29T00:00:00.000Z';

const completeSnapshot = {
  users: [
    {
      id: 'user_1',
      handle: 'snapshot-user',
      notes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  teams: [],
  memberships: [],
  accessKeys: [],
  sessions: [],
  knowledgeEntries: [],
  auditEvents: [],
  skillArtifacts: [],
  artifactFilePayloads: [],
  candidateSubmissions: [
    {
      id: 'candidate_1',
      sourceType: 'trap',
      submittedBy: 'user_1',
      teamId: null,
      status: 'received',
      originalPayload: {
        trap: {
          scope: 'global',
          labels: ['legacy'],
          shortcut: 'legacy-snapshot',
          detail: 'A complete legacy candidate record.',
        },
      },
      analysisSnapshot: null,
      duplicateCase: null,
      receivedAt: timestamp,
      queuedAt: null,
      analyzingAt: null,
      completedAt: null,
      lastError: null,
      retryCount: 0,
      manualResult: null,
    },
  ],
  duplicateCases: [],
  entityLineage: [],
  graphIndexDocuments: [],
  conflicts: [],
  feedbackQueue: [],
};

function sourceReturning(data: unknown): LegacySnapshotSource {
  return createLegacySnapshotSource({
    query: vi.fn().mockResolvedValue({ rows: [{ data }] }),
  });
}

describe('loadLegacySnapshot', () => {
  it('loads the singleton row and exposes typed owner bucket views', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ data: completeSnapshot }] });

    await expect(loadLegacySnapshot(createLegacySnapshotSource({ query }))).resolves.toMatchObject({
      identityAudit: { users: [expect.objectContaining({ id: 'user_1' })] },
      candidateIngestion: { candidateSubmissions: [expect.any(Object)] },
    });
    expect(query).toHaveBeenCalledWith('SELECT data FROM store_snapshot WHERE key = $1', ['main']);
  });

  it('requires exactly one store_snapshot main row', async () => {
    await expect(
      loadLegacySnapshot(
        createLegacySnapshotSource({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
      ),
    ).rejects.toThrow('legacy store_snapshot main row is required');

    await expect(
      loadLegacySnapshot(
        createLegacySnapshotSource({
          query: vi
            .fn()
            .mockResolvedValue({ rows: [{ data: completeSnapshot }, { data: completeSnapshot }] }),
        }),
      ),
    ).rejects.toThrow('legacy store_snapshot main row is required');
  });

  it.each([
    [{ users: [] }, 'missing required legacy bucket: teams'],
    [{ ...completeSnapshot, unknownBucket: [] }, 'unknown legacy snapshot bucket: unknownBucket'],
  ])('rejects malformed legacy source data', async (data, message) => {
    await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
  });

  it('rejects malformed records before exposing owner views', async () => {
    const { handle: _handle, ...userWithoutHandle } = completeSnapshot.users[0]!;

    await expect(
      loadLegacySnapshot(sourceReturning({ ...completeSnapshot, users: [userWithoutHandle] })),
    ).rejects.toThrow('handle');
  });

  it.each([
    [
      {
        ...completeSnapshot,
        memberships: [
          {
            id: 'membership_1',
            userId: 'user_1',
            teamId: 'team_1',
            roleTemplate: 'owner',
            securityLevel: 0,
            permissions: [],
            notes: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
      'roleTemplate',
    ],
    [
      {
        ...completeSnapshot,
        candidateSubmissions: [{ ...completeSnapshot.candidateSubmissions[0], status: 'bogus' }],
      },
      'status',
    ],
  ])('rejects invalid structured record values', async (data, message) => {
    await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
  });

  it('accepts only the documented technical bucket defaults', async () => {
    await expect(loadLegacySnapshot(sourceReturning(completeSnapshot))).resolves.toMatchObject({
      identityAudit: { users: [expect.objectContaining({ id: 'user_1' })] },
    });
  });

  it.each([
    [{ ...completeSnapshot, counters: [] }, 'counters'],
    [{ ...completeSnapshot, promptVersion: 'one' }, 'promptVersion'],
    [{ ...completeSnapshot, rebuildState: {} }, 'rebuildState'],
  ])('rejects malformed technical state', async (data, message) => {
    await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
  });

  it('returns immutable owner bucket views', async () => {
    const snapshot = await loadLegacySnapshot(sourceReturning(completeSnapshot));

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.identityAudit)).toBe(true);
    expect(Object.isFrozen(snapshot.identityAudit.users)).toBe(true);
  });
});
