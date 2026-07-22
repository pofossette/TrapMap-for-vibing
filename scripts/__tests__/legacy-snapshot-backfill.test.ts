import { describe, expect, it, vi } from 'vitest';

import {
  runLegacySnapshotBackfill,
  type LegacySnapshotBackfillSnapshot,
} from '../legacy-snapshot-backfill.js';

function createSnapshot(): LegacySnapshotBackfillSnapshot {
  return {
    counters: { user: 1 },
    users: [{ id: 'user_1' }],
    teams: [{ id: 'team_1' }],
    memberships: [{ id: 'member_1' }],
    accessKeys: [{ id: 'key_1' }],
    sessions: [{ id: 'session_1' }],
    auditEvents: [{ id: 'audit_1' }],
    knowledgeEntries: [{ id: 'knowledge_1' }],
    skillArtifacts: [{ id: 'artifact_1' }],
    artifactFilePayloads: [{ artifactId: 'artifact_1', revision: 1, path: 'SKILL.md' }],
    candidateSubmissions: [{ id: 'candidate_1' }],
    duplicateCases: [{ id: 'duplicate_1' }],
    entityLineage: [{ id: 'lineage_1' }],
    conflicts: [{ id: 'conflict_1' }],
    feedbackQueue: [{ id: 'feedback_1' }],
    graphIndexDocuments: [{ id: 'graph_legacy_1' }],
    promptVersion: 3,
    rebuildState: { targetVersion: 3, completedSourceKeys: ['knowledge_1'] },
  };
}

function createDeps() {
  return {
    readSnapshot: vi.fn(async () => createSnapshot()),
    migrateIdentityAudit: vi.fn(async () => ({ errors: [] as string[] })),
    migrateKnowledge: vi.fn(async () => ({ errors: [] as string[] })),
    migrateArtifacts: vi.fn(async () => ({ errors: [] as string[] })),
    migrateArtifactFilePayloads: vi.fn(async () => ({ errors: [] as string[] })),
    migrateCandidateIngestion: vi.fn(async () => ({ errors: [] as string[] })),
    migrateGovernance: vi.fn(async () => ({ errors: [] as string[] })),
    rebuildGraphProjection: vi.fn(async () => ({ sourceCount: 2, destinationCount: 2 })),
  };
}

describe('legacy snapshot backfill', () => {
  it('reads every legacy bucket once, delegates it to its owner, and rebuilds graph state', async () => {
    const deps = createDeps();

    const result = await runLegacySnapshotBackfill(deps);

    expect(deps.readSnapshot).toHaveBeenCalledTimes(1);
    expect(deps.migrateIdentityAudit).toHaveBeenCalledWith(
      expect.objectContaining({ users: [{ id: 'user_1' }], auditEvents: [{ id: 'audit_1' }] }),
    );
    expect(deps.migrateKnowledge).toHaveBeenCalledWith([{ id: 'knowledge_1' }]);
    expect(deps.migrateArtifacts).toHaveBeenCalledWith([{ id: 'artifact_1' }]);
    expect(deps.migrateArtifactFilePayloads).toHaveBeenCalledWith([
      { artifactId: 'artifact_1', revision: 1, path: 'SKILL.md' },
    ]);
    expect(deps.migrateCandidateIngestion).toHaveBeenCalledWith(
      expect.objectContaining({ candidateSubmissions: [{ id: 'candidate_1' }] }),
    );
    expect(deps.migrateGovernance).toHaveBeenCalledWith(
      expect.objectContaining({
        conflicts: [{ id: 'conflict_1' }],
        feedbackQueue: [{ id: 'feedback_1' }],
      }),
    );
    expect(deps.rebuildGraphProjection).toHaveBeenCalledWith({
      source: { knowledgeEntries: [{ id: 'knowledge_1' }], skillArtifacts: [{ id: 'artifact_1' }] },
      legacyDocumentCount: 1,
    });
    expect(result).toMatchObject({
      readyForCompatibilityStateDeletion: true,
      discardedLegacyBuckets: ['counters', 'promptVersion', 'rebuildState'],
      graphProjection: { sourceCount: 2, destinationCount: 2 },
    });
  });

  it('does not rebuild or authorize deletion when an owner reports a destination conflict', async () => {
    const deps = createDeps();
    deps.migrateGovernance.mockResolvedValueOnce({
      errors: [{ recordId: 'feedback_1', error: 'destination record differs from snapshot' }],
    });

    const result = await runLegacySnapshotBackfill(deps);

    expect(deps.rebuildGraphProjection).not.toHaveBeenCalled();
    expect(result.readyForCompatibilityStateDeletion).toBe(false);
    expect(result.errors).toEqual([
      {
        owner: 'governance-review',
        error: 'destination record differs from snapshot',
      },
    ]);
  });
});
