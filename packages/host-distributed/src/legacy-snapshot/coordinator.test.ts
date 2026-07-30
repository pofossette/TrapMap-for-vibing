import { describe, expect, it, vi } from 'vitest';

import {
  assertLegacySnapshotBackfillSucceeded,
  runLegacySnapshotBackfill,
  type LegacySnapshotBackfillOwners,
} from './coordinator.js';
import { createLegacySnapshotSource, type LegacySnapshotSource } from './source.js';

const timestamp = '2026-07-29T00:00:00.000Z';

const snapshotData = {
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

function sourceReturning(data = snapshotData): LegacySnapshotSource {
  return createLegacySnapshotSource({
    query: vi.fn().mockResolvedValue({ rows: [{ data }] }),
  });
}

function migrationResult(total: number, skipped = false) {
  return {
    migrated: skipped ? 0 : total,
    skipped: skipped ? total : 0,
    verified: total,
    errors: [],
  };
}

function createOwners(order: string[], skipped = false): LegacySnapshotBackfillOwners {
  return {
    identityAudit: async (snapshot) => {
      order.push('identity/audit');
      expect(Object.hasOwn(snapshot, 'graphIndexDocuments')).toBe(false);
      expect(Object.hasOwn(snapshot, 'promptVersion')).toBe(false);
      expect(Object.hasOwn(snapshot, 'rebuildState')).toBe(false);
      return {
        domains: Object.fromEntries(
          Object.entries(snapshot).map(([domain, records]) => [
            domain,
            {
              inserted: skipped ? 0 : records.length,
              skipped: skipped ? records.length : 0,
              errors: [],
            },
          ]),
        ),
        verification: Object.entries(snapshot).map(([domain, records]) => ({
          domain,
          snapshotCount: records.length,
          tableCount: records.length,
          matched: true,
        })),
        durationMs: 1,
      };
    },
    knowledge: async (snapshot) => {
      order.push('knowledge');
      return migrationResult(snapshot.knowledgeEntries.length, skipped);
    },
    artifacts: async (snapshot) => {
      order.push('artifacts');
      return {
        totalArtifacts: snapshot.skillArtifacts.length,
        ...migrationResult(snapshot.skillArtifacts.length, skipped),
        durationMs: 1,
      };
    },
    artifactFilePayloads: async (payloads) => {
      order.push('artifact payloads');
      return migrationResult(payloads.length, skipped);
    },
    candidateIngestion: async (snapshot) => {
      order.push('candidate/duplicate/lineage');
      return {
        domains: Object.fromEntries(
          Object.entries(snapshot).map(([domain, records]) => [
            domain,
            migrationResult(records.length, skipped),
          ]),
        ),
        verification: Object.entries(snapshot).map(([domain, records]) => ({
          domain,
          snapshotCount: records.length,
          destinationCount: records.length,
          matched: true,
        })),
      };
    },
    governance: async (snapshot) => {
      order.push('governance feedback/conflicts');
      return migrationResult(snapshot.feedbackQueue.length + snapshot.conflicts.length, skipped);
    },
    rebuildGraphProjection: async () => {
      order.push('knowledge-read graph rebuild');
      return { sourceCount: 0, destinationCount: 0 };
    },
  };
}

describe('runLegacySnapshotBackfill', () => {
  it('loads the source once, invokes owners in dependency order, and preserves successful evidence', async () => {
    const order: string[] = [];
    const source = sourceReturning();

    const result = await runLegacySnapshotBackfill({ source, owners: createOwners(order) });

    expect(source.query).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      'identity/audit',
      'knowledge',
      'artifacts',
      'artifact payloads',
      'candidate/duplicate/lineage',
      'governance feedback/conflicts',
      'knowledge-read graph rebuild',
    ]);
    expect(result).toMatchObject({
      succeeded: true,
      sourceCounts: {
        identityAudit: {
          users: 1,
          teams: 0,
          memberships: 0,
          accessKeys: 0,
          sessions: 0,
          auditEvents: 0,
        },
        knowledgeEntries: 0,
        skillArtifacts: 0,
        artifactFilePayloads: 0,
        candidateIngestion: { candidateSubmissions: 1, duplicateCases: 0, entityLineage: 0 },
        governance: { feedbackQueue: 0, conflicts: 0 },
      },
      buckets: {
        identityAudit: {
          verification: expect.arrayContaining([
            expect.objectContaining({ domain: 'users', matched: true }),
          ]),
        },
        candidateIngestion: {
          verification: expect.arrayContaining([
            expect.objectContaining({ domain: 'candidateSubmissions', matched: true }),
          ]),
        },
        graphProjection: { sourceCount: 0, destinationCount: 0 },
      },
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'identity/audit',
          bucket: 'users',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'candidate/duplicate/lineage',
          bucket: 'candidateSubmissions',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
      ]),
    );
  });

  it('returns the owner skipped and verified evidence from a second identical run', async () => {
    const source = sourceReturning();
    const first = await runLegacySnapshotBackfill({ source, owners: createOwners([]) });
    const second = await runLegacySnapshotBackfill({ source, owners: createOwners([], true) });

    expect(first.succeeded).toBe(true);
    expect(second).toMatchObject({
      succeeded: true,
      buckets: {
        identityAudit: { domains: { users: { skipped: 1, errors: [] } } },
        candidateIngestion: { domains: { candidateSubmissions: { skipped: 1, errors: [] } } },
      },
    });
  });

  it('wraps an owner exception with its owner name and stops immediately', async () => {
    const order: string[] = [];
    const owners = createOwners(order);
    const original = owners.artifacts;
    owners.artifacts = async (snapshot) => {
      await original(snapshot);
      throw new Error('database unavailable');
    };

    await expect(runLegacySnapshotBackfill({ source: sourceReturning(), owners })).rejects.toThrow(
      'legacy snapshot backfill failed for artifacts: database unavailable',
    );
    expect(order).toEqual(['identity/audit', 'knowledge', 'artifacts']);
  });

  it('rejects a report not marked successful', () => {
    expect(() =>
      assertLegacySnapshotBackfillSucceeded({ succeeded: false } as Parameters<
        typeof assertLegacySnapshotBackfillSucceeded
      >[0]),
    ).toThrow('legacy snapshot backfill did not succeed');
  });

  it.each([
    [
      'identity/audit',
      (owners: LegacySnapshotBackfillOwners) => {
        const original = owners.identityAudit;
        owners.identityAudit = async (snapshot) => ({
          ...(await original(snapshot)),
          verification: [],
        });
      },
      ['identity/audit'],
    ],
    [
      'knowledge',
      (owners: LegacySnapshotBackfillOwners) => {
        const original = owners.knowledge;
        owners.knowledge = async (snapshot) => ({
          ...(await original(snapshot)),
          errors: [{ recordId: 'knowledge_1', error: 'mismatch' }],
        });
      },
      ['identity/audit', 'knowledge'],
    ],
    [
      'candidate/duplicate/lineage',
      (owners: LegacySnapshotBackfillOwners) => {
        const original = owners.candidateIngestion;
        owners.candidateIngestion = async (snapshot) => ({
          ...(await original(snapshot)),
          verification: [
            {
              domain: 'candidateSubmissions',
              snapshotCount: 1,
              destinationCount: 0,
              matched: false,
            },
          ],
        });
      },
      [
        'identity/audit',
        'knowledge',
        'artifacts',
        'artifact payloads',
        'candidate/duplicate/lineage',
      ],
    ],
    [
      'governance feedback/conflicts',
      (owners: LegacySnapshotBackfillOwners) => {
        const original = owners.governance;
        owners.governance = async (snapshot) => ({
          ...(await original(snapshot)),
          errors: [{ domain: 'conflicts', recordId: 'conflict_1', error: 'mismatch' }],
        });
      },
      [
        'identity/audit',
        'knowledge',
        'artifacts',
        'artifact payloads',
        'candidate/duplicate/lineage',
        'governance feedback/conflicts',
      ],
    ],
    [
      'knowledge-read graph rebuild',
      (owners: LegacySnapshotBackfillOwners) => {
        const original = owners.rebuildGraphProjection;
        owners.rebuildGraphProjection = async () => {
          await original();
          return { sourceCount: 1, destinationCount: 0 };
        };
      },
      [
        'identity/audit',
        'knowledge',
        'artifacts',
        'artifact payloads',
        'candidate/duplicate/lineage',
        'governance feedback/conflicts',
        'knowledge-read graph rebuild',
      ],
    ],
  ])(
    'fails closed for %s evidence and does not invoke later owners',
    async (ownerName, breakOwner, expectedOrder) => {
      const order: string[] = [];
      const owners = createOwners(order);
      breakOwner(owners);

      await expect(
        runLegacySnapshotBackfill({ source: sourceReturning(), owners }),
      ).rejects.toThrow(`legacy snapshot backfill failed for ${ownerName}`);
      expect(order).toEqual(expectedOrder);
    },
  );
});
