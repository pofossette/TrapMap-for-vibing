import { describe, expect, it, vi } from 'vitest';

import { createLegacySnapshotOwnerWiring } from '../legacy-snapshot-owner-wiring.js';

describe('legacy snapshot owner wiring', () => {
  it('constructs only owner-local importer dependencies and retains an explicit graph rebuild', () => {
    const rebuildGraphProjection = vi.fn(async () => ({ sourceCount: 0, destinationCount: 0 }));
    const wiring = createLegacySnapshotOwnerWiring(
      { query: vi.fn(), connect: vi.fn() } as never,
      rebuildGraphProjection,
    );

    expect(wiring).toEqual(
      expect.objectContaining({
        migrateIdentityAudit: expect.any(Function),
        migrateKnowledge: expect.any(Function),
        migrateArtifacts: expect.any(Function),
        migrateArtifactFilePayloads: expect.any(Function),
        migrateCandidateIngestion: expect.any(Function),
        migrateGovernance: expect.any(Function),
        rebuildGraphProjection,
      }),
    );
  });
});
