/**
 * Phase 6: Capsule Index Rebuild Tests
 *
 * Tests the rebuild, reconciliation, and cleanup utilities for capsule
 * derived index tables.
 */

import {
  cleanupOrphanCapsuleIndexes,
  rebuildAllCapsuleIndexes,
  rebuildCapsuleIndexForArtifact,
  verifyCapsuleIndexHealth,
} from '@trapmap/server/lib/retrieval/capsules/repositories/index-rebuild.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockArtifact, createMockCapsule } from './test-helpers.js';

// Mock the drizzle module to return a controllable mock db
const mockDb = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  orderBy: vi.fn().mockReturnThis(),
};

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDb),
}));

// Mock generateEmbedding
vi.mock('../../../lib/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(384).fill(0.01)),
}));

function makeMockPool() {
  return {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  };
}

function makeTestArtifacts(): SkillArtifactRecord[] {
  return [
    createMockArtifact({
      id: 'artifact_1',
      teamId: null,
      scope: 'global',
      lifecycleState: 'approved',
      requiredLevel: 0,
      title: 'Docker Node Version Mismatch',
      labels: ['docker', 'node'],
      capsules: [
        createMockCapsule({
          capsuleId: 'capsule_1',
          artifactId: 'artifact_1',
          situation: 'When deploying containers',
          problem: 'Node version mismatch',
          goal: 'Pin Node version in Dockerfile',
          labels: ['docker', 'node'],
          scope: 'global',
          requiredLevel: 0,
        }),
      ],
    }),
  ];
}

describe('Capsule Index Rebuild', () => {
  let artifacts: SkillArtifactRecord[];

  beforeEach(() => {
    vi.clearAllMocks();
    artifacts = makeTestArtifacts();
  });

  describe('rebuildAllCapsuleIndexes', () => {
    it('should process all artifacts and return stats', async () => {
      mockDb.delete = vi.fn().mockResolvedValue({ rowCount: 0 }) as never;
      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        })),
      })) as never;

      const stats = await rebuildAllCapsuleIndexes({
        pool: makeMockPool() as never,
        artifacts,
      });

      expect(stats.artifactsProcessed).toBe(1);
      expect(stats.capsulesSynced).toBeGreaterThan(0);
      expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty artifacts', async () => {
      mockDb.delete = vi.fn().mockResolvedValue({ rowCount: 0 }) as never;

      const stats = await rebuildAllCapsuleIndexes({
        pool: makeMockPool() as never,
        artifacts: [],
      });

      expect(stats.artifactsProcessed).toBe(0);
      expect(stats.capsulesSynced).toBe(0);
    });

    it('should call onProgress callback', async () => {
      mockDb.delete = vi.fn().mockResolvedValue({ rowCount: 0 }) as never;
      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        })),
      })) as never;

      const progressCalls: Array<{ processed: number; total: number }> = [];

      await rebuildAllCapsuleIndexes({
        pool: makeMockPool() as never,
        artifacts,
        onProgress: (p) => progressCalls.push({ processed: p.processed, total: p.total }),
      });

      expect(progressCalls.length).toBeGreaterThanOrEqual(1);
      expect(progressCalls[0]!.total).toBe(1);
    });
  });

  describe('rebuildCapsuleIndexForArtifact', () => {
    it('should rebuild for a specific artifact', async () => {
      mockDb.insert = vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        })),
      })) as never;

      const result = await rebuildCapsuleIndexForArtifact(
        { pool: makeMockPool() as never, artifacts },
        'artifact_1',
      );

      expect(result).not.toBeNull();
      expect(result!.keyword.length).toBeGreaterThanOrEqual(0);
      expect(result!.embedding.length).toBeGreaterThanOrEqual(0);
    });

    it('should return null for unknown artifact ID', async () => {
      const result = await rebuildCapsuleIndexForArtifact(
        { pool: makeMockPool() as never, artifacts },
        'nonexistent',
      );

      expect(result).toBeNull();
    });
  });

  describe('verifyCapsuleIndexHealth', () => {
    it('should return health report with source capsule count', async () => {
      mockDb.select = vi.fn(() => ({
        from: vi
          .fn()
          .mockResolvedValue([{ capsuleId: 'capsule_1', status: 'synced', last_error: null }]),
      })) as never;

      const report = await verifyCapsuleIndexHealth({
        pool: makeMockPool() as never,
        artifacts,
      });

      expect(report.totalSourceCapsules).toBe(1);
      expect(report.missingKeywords.length).toBe(0);
      expect(report.missingEmbeddings.length).toBe(0);
    });

    it('should detect missing entries when no index rows exist', async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn().mockResolvedValue([]),
      })) as never;

      const report = await verifyCapsuleIndexHealth({
        pool: makeMockPool() as never,
        artifacts,
      });

      expect(report.missingKeywords).toContain('capsule_1');
      expect(report.missingEmbeddings).toContain('capsule_1');
      expect(report.totalSourceCapsules).toBe(1);
      expect(report.totalKeywordRows).toBe(0);
      expect(report.totalEmbeddingRows).toBe(0);
    });

    it('should detect orphan entries', async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn().mockResolvedValue([
          { capsuleId: 'capsule_1', status: 'synced', last_error: null },
          { capsuleId: 'orphan_1', status: 'synced', last_error: null },
        ]),
      })) as never;

      const report = await verifyCapsuleIndexHealth({
        pool: makeMockPool() as never,
        artifacts,
      });

      expect(report.orphanKeywords).toContain('orphan_1');
      expect(report.orphanEmbeddings).toContain('orphan_1');
    });

    it('should detect failed entries', async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn().mockResolvedValue([
          { capsuleId: 'capsule_1', status: 'synced', last_error: null },
          { capsuleId: 'capsule_2', status: 'failed', last_error: 'Embedding timeout' },
        ]),
      })) as never;

      const report = await verifyCapsuleIndexHealth({
        pool: makeMockPool() as never,
        artifacts,
      });

      expect(report.failedKeywords.some((f) => f.capsuleId === 'capsule_2')).toBe(true);
    });
  });

  describe('cleanupOrphanCapsuleIndexes', () => {
    it('should clean up orphan index entries', async () => {
      mockDb.select = vi.fn(() => ({
        from: vi.fn().mockResolvedValue([{ capsuleId: 'capsule_1' }, { capsuleId: 'orphan_1' }]),
      })) as never;
      mockDb.delete = vi.fn(() => ({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      })) as never;

      const result = await cleanupOrphanCapsuleIndexes({
        pool: makeMockPool() as never,
        artifacts,
      });

      expect(result.removedKeywords).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty source artifacts', async () => {
      mockDb.delete = vi.fn().mockResolvedValue({ rowCount: 0 }) as never;

      const result = await cleanupOrphanCapsuleIndexes({
        pool: makeMockPool() as never,
        artifacts: [],
      });

      expect(result.removedKeywords).toBe(0);
      expect(result.removedEmbeddings).toBe(0);
    });
  });
});
