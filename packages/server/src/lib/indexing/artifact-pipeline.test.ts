/**
 * Unit tests for artifact pipeline adapter fan-out seam.
 *
 * Tests cover:
 * - registerArtifactAdapters / getArtifactAdapters registration
 * - runArtifactAdapterFanOut success and error paths
 * - runArtifactAdapterFanOut adapter override
 * - runArtifactAdapterRemoval success and override paths
 * - Performed work tracking and aggregation
 *
 * Phase: 70 (TEST-03)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SkillArtifactRecord, StoreData } from '@trapmap/server/lib/store.js';
import { createEmptyStoreData, nowIso } from '@trapmap/server/lib/store.js';
import type { ArtifactGraphAdapter } from './adapters/artifact-graph.js';
import {
  getArtifactAdapters,
  registerArtifactAdapters,
  resolveArtifactAdapters,
  runArtifactAdapterFanOut,
  runArtifactAdapterRemoval,
} from './artifact-pipeline.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<ArtifactGraphAdapter> = {}): ArtifactGraphAdapter {
  return {
    sync: vi.fn().mockResolvedValue({ success: true, performedWork: true, error: null }),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createTestArtifact(overrides: Partial<SkillArtifactRecord> = {}): SkillArtifactRecord {
  const now = nowIso();
  return {
    id: 'artifact-test-1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    title: 'Test Artifact',
    slug: 'test-artifact',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      sourceHash: 'hash-1',
      files: [],
      submittedAt: now,
      submittedByUserId: 'user-1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: 'artifact-test-1',
          revision: 1,
          sourceHash: 'hash-1',
          title: 'Test Artifact',
          summary: 'A test artifact for unit testing',
          keywords: ['test'],
          referencePaths: [],
          contentHash: 'profile-hash',
        },
        capsules: [],
        clientManifest: null,
        sourceHash: 'derived-hash',
        derivedAt: now,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createTestData(): StoreData {
  return createEmptyStoreData();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('artifact-pipeline', () => {
  afterEach(() => {
    // Reset module-level registered adapters to empty
    registerArtifactAdapters([]);
  });

  describe('registerArtifactAdapters / getArtifactAdapters', () => {
    it('registers adapters array', () => {
      const adapter = createMockAdapter();
      registerArtifactAdapters([adapter]);
      expect(getArtifactAdapters()).toHaveLength(1);
      expect(getArtifactAdapters()[0]).toBe(adapter);
    });

    it('getArtifactAdapters returns registered adapters', () => {
      const a1 = createMockAdapter();
      const a2 = createMockAdapter();
      registerArtifactAdapters([a1, a2]);
      const result = getArtifactAdapters();
      expect(result).toEqual([a1, a2]);
    });

    it('can be called multiple times (replaces previous)', () => {
      const a1 = createMockAdapter();
      const a2 = createMockAdapter();
      registerArtifactAdapters([a1]);
      expect(getArtifactAdapters()).toHaveLength(1);

      registerArtifactAdapters([a2]);
      expect(getArtifactAdapters()).toHaveLength(1);
      expect(getArtifactAdapters()[0]).toBe(a2);
    });

    it('defaults to empty array', () => {
      expect(getArtifactAdapters()).toEqual([]);
    });

    it('resolves the shared default graph adapter when nothing is registered', () => {
      const resolved = resolveArtifactAdapters(null);

      expect(resolved).toHaveLength(1);
      expect(typeof resolved[0]!.sync).toBe('function');
      expect(typeof resolved[0]!.remove).toBe('function');
    });
  });

  describe('runArtifactAdapterFanOut', () => {
    it('calls sync() on each adapter', async () => {
      const a1 = createMockAdapter();
      const a2 = createMockAdapter();
      registerArtifactAdapters([a1, a2]);

      const data = createTestData();
      const artifact = createTestArtifact();

      await runArtifactAdapterFanOut({ data, artifact });

      expect(a1.sync).toHaveBeenCalledWith({ data, artifact });
      expect(a2.sync).toHaveBeenCalledWith({ data, artifact });
    });

    it('returns success: true when all succeed', async () => {
      const a1 = createMockAdapter();
      const a2 = createMockAdapter();
      registerArtifactAdapters([a1, a2]);

      const result = await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]!.success).toBe(true);
      expect(result.results[1]!.success).toBe(true);
    });

    it('collects results from each adapter', async () => {
      const a1 = createMockAdapter({
        sync: vi.fn().mockResolvedValue({ success: true, performedWork: true, error: null }),
      });
      const a2 = createMockAdapter({
        sync: vi.fn().mockResolvedValue({ success: true, performedWork: false, error: null }),
      });
      registerArtifactAdapters([a1, a2]);

      const result = await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(result.results[0]!.performedWork).toBe(true);
      expect(result.results[1]!.performedWork).toBe(false);
    });

    it('uses registered adapters when adapters param not provided', async () => {
      const adapter = createMockAdapter();
      registerArtifactAdapters([adapter]);

      await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(adapter.sync).toHaveBeenCalledTimes(1);
    });

    it('uses pool-resolved adapters when none are registered', async () => {
      registerArtifactAdapters([]);
      const data = createTestData();
      const artifact = createTestArtifact();

      await runArtifactAdapterFanOut({
        data,
        artifact,
        pool: null,
      });

      expect(data.graphIndexDocuments).toHaveLength(1);
      expect(data.graphIndexDocuments[0]?.sourceId).toBe(artifact.id);
    });

    it('uses adapters parameter when provided (override)', async () => {
      const registered = createMockAdapter();
      const override = createMockAdapter();
      registerArtifactAdapters([registered]);

      await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
        adapters: [override],
      });

      expect(override.sync).toHaveBeenCalledTimes(1);
      expect(registered.sync).not.toHaveBeenCalled();
    });

    it('does not modify registered adapters when using override', async () => {
      const registered = createMockAdapter();
      const override = createMockAdapter();
      registerArtifactAdapters([registered]);

      await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
        adapters: [override],
      });

      expect(getArtifactAdapters()).toEqual([registered]);
    });

    it('returns success: false when any adapter fails', async () => {
      const ok = createMockAdapter({
        sync: vi.fn().mockResolvedValue({ success: true, performedWork: true, error: null }),
      });
      const fail = createMockAdapter({
        sync: vi.fn().mockResolvedValue({ success: false, performedWork: false, error: 'boom' }),
      });
      registerArtifactAdapters([ok, fail]);

      const result = await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(result.success).toBe(false);
    });

    it('catches adapter exceptions and records error message', async () => {
      const exploding = createMockAdapter({
        sync: vi.fn().mockRejectedValue(new Error('adapter crashed')),
      });
      registerArtifactAdapters([exploding]);

      const result = await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.success).toBe(false);
      expect(result.results[0]!.performedWork).toBe(false);
      expect(result.results[0]!.error).toBe('adapter crashed');
    });

    it('catches non-Error exceptions and converts to string', async () => {
      const exploding = createMockAdapter({
        sync: vi.fn().mockRejectedValue('string error'),
      });
      registerArtifactAdapters([exploding]);

      const result = await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(result.results[0]!.error).toBe('string error');
    });

    it('continues to other adapters after one fails', async () => {
      const exploding = createMockAdapter({
        sync: vi.fn().mockRejectedValue(new Error('fail')),
      });
      const ok = createMockAdapter({
        sync: vi.fn().mockResolvedValue({ success: true, performedWork: true, error: null }),
      });
      registerArtifactAdapters([exploding, ok]);

      const result = await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0]!.success).toBe(false);
      expect(result.results[1]!.success).toBe(true);
      expect(ok.sync).toHaveBeenCalledTimes(1);
    });

    it('returns empty results when no adapters registered', async () => {
      registerArtifactAdapters([]);

      const result = await runArtifactAdapterFanOut({
        data: createTestData(),
        artifact: createTestArtifact(),
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('runArtifactAdapterRemoval', () => {
    it('calls remove() on each adapter', async () => {
      const a1 = createMockAdapter();
      const a2 = createMockAdapter();
      registerArtifactAdapters([a1, a2]);

      const data = createTestData();
      await runArtifactAdapterRemoval({ data, artifactId: 'artifact-test-1' });

      expect(a1.remove).toHaveBeenCalledWith({ data, artifactId: 'artifact-test-1' });
      expect(a2.remove).toHaveBeenCalledWith({ data, artifactId: 'artifact-test-1' });
    });

    it('uses registered adapters when adapters param not provided', async () => {
      const adapter = createMockAdapter();
      registerArtifactAdapters([adapter]);

      await runArtifactAdapterRemoval({
        data: createTestData(),
        artifactId: 'artifact-test-1',
      });

      expect(adapter.remove).toHaveBeenCalledTimes(1);
    });

    it('uses pool-resolved adapters for removal when none are registered', async () => {
      registerArtifactAdapters([]);
      const data = createTestData();
      const artifact = createTestArtifact();

      await runArtifactAdapterFanOut({
        data,
        artifact,
        pool: null,
      });
      expect(data.graphIndexDocuments).toHaveLength(1);

      await runArtifactAdapterRemoval({
        data,
        artifactId: artifact.id,
        pool: null,
      });

      expect(data.graphIndexDocuments).toHaveLength(0);
    });

    it('uses adapters parameter when provided', async () => {
      const registered = createMockAdapter();
      const override = createMockAdapter();
      registerArtifactAdapters([registered]);

      await runArtifactAdapterRemoval({
        data: createTestData(),
        artifactId: 'artifact-test-1',
        adapters: [override],
      });

      expect(override.remove).toHaveBeenCalledTimes(1);
      expect(registered.remove).not.toHaveBeenCalled();
    });
  });
});
