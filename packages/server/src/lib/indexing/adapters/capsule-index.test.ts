/**
 * Capsule Index Adapter Tests
 *
 * Tests the capsule index adapter for lifecycle-driven capsule PG index
 * maintenance: sync on approve, stale cleanup, full removal on leave-approved.
 */

import { createCapsuleIndexAdapter } from '@trapmap/server/lib/indexing/adapters/capsule-index.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockArtifact,
  createMockCapsule,
} from '../../../__tests__/lib/retrieval/test-helpers.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockIndexedCapsuleIds: string[] = [];

const mockCapsuleIndexSync = {
  syncArtifactCapsules: vi.fn().mockResolvedValue({
    keyword: [{ capsuleId: 'capsule_1', status: 'synced' }],
    embedding: [{ capsuleId: 'capsule_1', status: 'synced' }],
  }),
  removeCapsuleIndex: vi.fn().mockResolvedValue(undefined),
  removeCapsuleIndexesForArtifact: vi.fn().mockResolvedValue(undefined),
  getIndexedCapsuleIds: vi
    .fn()
    .mockImplementation(() => Promise.resolve([...mockIndexedCapsuleIds])),
  getSyncStatus: vi.fn(),
  syncKeywordTokens: vi.fn(),
  syncEmbedding: vi.fn(),
};

vi.mock('@trapmap/server/lib/retrieval/capsules/repositories/index-sync.js', () => ({
  createCapsuleIndexSync: vi.fn(() => mockCapsuleIndexSync),
}));

// Mock generateEmbedding (not used directly but required by transitive imports)
vi.mock('@trapmap/server/lib/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0.01)),
}));

function makeMockPool() {
  return { query: vi.fn(), connect: vi.fn(), end: vi.fn() };
}

function makeTestArtifact(capsuleIds: string[]): SkillArtifactRecord {
  return createMockArtifact({
    id: 'artifact_1',
    teamId: null,
    scope: 'global',
    lifecycleState: 'approved',
    requiredLevel: 0,
    title: 'Test Artifact',
    labels: ['test'],
    capsules: capsuleIds.map((id) =>
      createMockCapsule({
        capsuleId: id,
        artifactId: 'artifact_1',
        situation: `Situation for ${id}`,
        problem: `Problem for ${id}`,
        goal: `Goal for ${id}`,
        labels: ['test'],
        scope: 'global',
        requiredLevel: 0,
      }),
    ),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Capsule Index Adapter', () => {
  let adapter: ReturnType<typeof createCapsuleIndexAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexedCapsuleIds.length = 0;
    adapter = createCapsuleIndexAdapter({
      pool: makeMockPool() as never,
    });
  });

  describe('syncArtifact', () => {
    it('should sync capsules for an approved artifact', async () => {
      const artifact = makeTestArtifact(['capsule_1']);
      const result = await adapter.syncArtifact(artifact);

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockCapsuleIndexSync.syncArtifactCapsules).toHaveBeenCalledWith(artifact);
    });

    it('should remove stale capsules no longer in the current revision', async () => {
      // Simulate previously indexed capsules including one that's now stale
      mockIndexedCapsuleIds.push('capsule_1', 'capsule_stale');

      const artifact = makeTestArtifact(['capsule_1']);
      const result = await adapter.syncArtifact(artifact);

      expect(result.synced).toBe(1);
      expect(result.staleRemoved).toBe(1);
      expect(mockCapsuleIndexSync.removeCapsuleIndex).toHaveBeenCalledWith('capsule_stale');
    });

    it('should handle artifacts with no capsules', async () => {
      mockCapsuleIndexSync.syncArtifactCapsules.mockResolvedValueOnce({
        keyword: [],
        embedding: [],
      });

      const artifact = makeTestArtifact([]);
      const result = await adapter.syncArtifact(artifact);

      expect(result.synced).toBe(0);
      expect(result.staleRemoved).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should track errors from failed sync operations', async () => {
      mockCapsuleIndexSync.syncArtifactCapsules.mockResolvedValueOnce({
        keyword: [{ capsuleId: 'capsule_1', status: 'failed', lastError: 'pg error' }],
        embedding: [{ capsuleId: 'capsule_1', status: 'synced' }],
      });

      const artifact = makeTestArtifact(['capsule_1']);
      const result = await adapter.syncArtifact(artifact);

      expect(result.errors).toBe(1);
    });

    it('should not call removeCapsuleIndex when no stale capsules exist', async () => {
      mockIndexedCapsuleIds.push('capsule_1');

      const artifact = makeTestArtifact(['capsule_1']);
      await adapter.syncArtifact(artifact);

      expect(mockCapsuleIndexSync.removeCapsuleIndex).not.toHaveBeenCalled();
    });
  });

  describe('removeArtifact', () => {
    it('should remove all capsule indexes for an artifact', async () => {
      await adapter.removeArtifact('artifact_1');

      expect(mockCapsuleIndexSync.removeCapsuleIndexesForArtifact).toHaveBeenCalledWith(
        'artifact_1',
      );
    });
  });
});
