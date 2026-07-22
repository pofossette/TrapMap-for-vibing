import { describe, expect, it, vi } from 'vitest';

import { runLegacySnapshotBackfillCommand } from '../backfill-legacy-snapshot.js';

describe('legacy snapshot backfill command', () => {
  it('binds separate source and target pools to the snapshot reader and owner-only rebuild', async () => {
    const sourcePool = { name: 'source' } as never;
    const targetPool = { name: 'target' } as never;
    const readSnapshot = vi.fn(async () => ({ key: 'legacy-snapshot' }));
    const rebuildGraphProjection = vi.fn(async () => ({ sourceCount: 2, destinationCount: 2 }));
    const createOwnerWiring = vi.fn((_pool, rebuild) => ({
      migrateKnowledge: vi.fn(),
      rebuildGraphProjection: rebuild,
    }));
    const runBackfill = vi.fn(async () => ({ readyForCompatibilityStateDeletion: false }));

    const result = await runLegacySnapshotBackfillCommand({
      sourcePool,
      targetPool,
      readSnapshot,
      createGraphRebuilder: vi.fn(() => rebuildGraphProjection),
      createOwnerWiring,
      runBackfill,
    });

    expect(readSnapshot).toHaveBeenCalledWith(sourcePool);
    expect(createOwnerWiring).toHaveBeenCalledWith(targetPool, rebuildGraphProjection);
    expect(runBackfill).toHaveBeenCalledWith({
      readSnapshot: expect.any(Function),
      migrateKnowledge: expect.any(Function),
      rebuildGraphProjection: expect.any(Function),
    });
    expect(result).toEqual({ readyForCompatibilityStateDeletion: false });
  });
});
