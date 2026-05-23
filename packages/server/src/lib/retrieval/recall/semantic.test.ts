/**
 * Unit tests for semantic recall adapter.
 *
 * Tests cover:
 * - buildEmbeddingText: text assembly from entry fields
 * - cosineSimilarity: vector math correctness
 * - computeScore: metadata-aware scoring with boosts
 * - getEntryEmbedding / getQueryEmbedding: embedding retrieval with cache support
 */

import { describe, expect, it, vi } from 'vitest';

import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import {
  buildEmbeddingText,
  computeScore,
  cosineSimilarity,
  getBatchEmbeddings,
  getEntryEmbedding,
  getQueryEmbedding,
  optimizedSemanticRecall,
} from './semantic.js';

// Mock the embeddings module
vi.mock('../../embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  hashEmbeddingText: vi.fn().mockReturnValue('mock-hash-123'),
}));

import { generateEmbedding, hashEmbeddingText } from '@trapmap/server/lib/embeddings.js';

/**
 * Helper to create a minimal KnowledgeRecord for testing.
 */
function createTestEntry(overrides: Partial<KnowledgeRecord>): KnowledgeRecord {
  return {
    id: 'test_1',
    teamId: null,
    scope: 'global',
    labels: [],
    shortcut: '',
    detail: '',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      shortcut: '',
      detail: '',
      labels: [],
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as KnowledgeRecord;
}

describe('semantic recall', () => {
  describe('buildEmbeddingText', () => {
    it('concatenates shortcut, detail, and labels', () => {
      const entry = createTestEntry({
        shortcut: 'JWT Auth',
        detail: 'Use JWT for API auth',
        labels: ['security', 'auth'],
      });

      const text = buildEmbeddingText(entry);

      expect(text).toBe('JWT Auth\nUse JWT for API auth\nsecurity auth');
    });

    it('trims whitespace from the result', () => {
      const entry = createTestEntry({
        shortcut: '',
        detail: '',
        labels: ['test'],
      });

      const text = buildEmbeddingText(entry);

      expect(text).toBe('test');
    });

    it('handles empty labels array', () => {
      const entry = createTestEntry({
        shortcut: 'Title',
        detail: 'Body text',
        labels: [],
      });

      const text = buildEmbeddingText(entry);

      // Empty labels produces empty string, then trailing newline is trimmed
      expect(text).toBe('Title\nBody text');
    });

    it('handles entries with all empty fields', () => {
      const entry = createTestEntry({
        shortcut: '',
        detail: '',
        labels: [],
      });

      const text = buildEmbeddingText(entry);

      // After trim, empty fields produce empty string
      expect(text).toBe('');
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
      const v = [1, 2, 3];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
    });

    it('returns 0.0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('returns correct value for known similar vectors', () => {
      // [1,1,0] and [1,0,1]: dot=1, |a|=sqrt(2), |b|=sqrt(2), sim=1/2=0.5
      const a = [1, 1, 0];
      const b = [1, 0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.5);
    });

    it('returns 0.0 when first vector is zero', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('returns 0.0 when second vector is zero', () => {
      const a = [1, 2, 3];
      const b = [0, 0, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('throws error for mismatched dimensions', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => cosineSimilarity(a, b)).toThrow('Vector dimensions must match');
    });

    it('handles negative values correctly', () => {
      // [1, -1] and [-1, 1]: dot=-1-1=-2, |a|=sqrt(2), |b|=sqrt(2), sim=-2/2=-1
      const a = [1, -1];
      const b = [-1, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it('handles single-element vectors', () => {
      expect(cosineSimilarity([5], [3])).toBeCloseTo(1.0);
      expect(cosineSimilarity([5], [-3])).toBeCloseTo(-1.0);
    });
  });

  describe('computeScore', () => {
    it('clamps negative similarity to 0', () => {
      const entry = createTestEntry({ labels: [], scope: 'global' });
      const filters = { labels: [], scopes: [] };

      const score = computeScore(-0.5, entry, filters);

      expect(score).toBe(0);
    });

    it('clamps similarity above 1 to 1', () => {
      const entry = createTestEntry({ labels: [], scope: 'global' });
      const filters = { labels: [], scopes: [] };

      const score = computeScore(1.5, entry, filters);

      expect(score).toBe(1);
    });

    it('applies 0.05 boost per matching label', () => {
      const entry = createTestEntry({ labels: ['security', 'auth'], scope: 'global' });
      const filters = { labels: ['security', 'auth'], scopes: [] };

      const score = computeScore(0.8, entry, filters);

      // 0.8 + 2 * 0.05 = 0.9
      expect(score).toBeCloseTo(0.9);
    });

    it('applies 0.03 boost for exact scope match', () => {
      const entry = createTestEntry({ labels: [], scope: 'project' });
      const filters = { labels: [], scopes: ['project'] };

      const score = computeScore(0.8, entry, filters);

      expect(score).toBeCloseTo(0.83);
    });

    it('caps score at 1.0 with boosts', () => {
      const entry = createTestEntry({
        labels: ['security', 'auth', 'jwt'],
        scope: 'project',
      });
      const filters = { labels: ['security', 'auth', 'jwt'], scopes: ['project'] };

      const score = computeScore(0.95, entry, filters);

      // 0.95 + 3*0.05 + 0.03 = 1.13 -> clamped to 1.0
      expect(score).toBe(1.0);
    });

    it('handles empty filters with no boosts', () => {
      const entry = createTestEntry({ labels: ['security'], scope: 'global' });
      const filters = { labels: [], scopes: [] };

      const score = computeScore(0.7, entry, filters);

      expect(score).toBeCloseTo(0.7);
    });

    it('handles multiple matching labels', () => {
      const entry = createTestEntry({ labels: ['a', 'b', 'c', 'd'], scope: 'global' });
      const filters = { labels: ['a', 'c'], scopes: [] };

      const score = computeScore(0.5, entry, filters);

      // 0.5 + 2 * 0.05 = 0.6
      expect(score).toBeCloseTo(0.6);
    });

    it('does not apply scope boost when scopes has multiple values', () => {
      const entry = createTestEntry({ labels: [], scope: 'project' });
      const filters = { labels: [], scopes: ['project', 'global'] };

      const score = computeScore(0.8, entry, filters);

      // scopes.length !== 1, so no scope boost
      expect(score).toBeCloseTo(0.8);
    });

    it('does not apply scope boost when scope does not match', () => {
      const entry = createTestEntry({ labels: [], scope: 'global' });
      const filters = { labels: [], scopes: ['project'] };

      const score = computeScore(0.8, entry, filters);

      expect(score).toBeCloseTo(0.8);
    });

    it('ignores non-matching labels in filters', () => {
      const entry = createTestEntry({ labels: ['security'], scope: 'global' });
      const filters = { labels: ['database', 'network'], scopes: [] };

      const score = computeScore(0.7, entry, filters);

      // No matching labels, no boost
      expect(score).toBeCloseTo(0.7);
    });
  });

  describe('getEntryEmbedding', () => {
    it('returns cached vector when indexState is synced with matching hash', async () => {
      const cachedVector = [0.5, 0.6, 0.7];
      const entry = createTestEntry({
        history: [{ revision: 1 } as any],
        embeddingCache: {
          textHash: 'mock-hash-123',
          vector: cachedVector,
        },
        indexState: {
          contentHash: 'mock-hash-123',
          normalizedAt: '2024-01-01T00:00:00Z',
          vector: {
            status: 'synced',
            revision: 1,
            contentHash: 'mock-hash-123',
            lastSyncedAt: '2024-01-01T00:00:00Z',
            lastError: null,
          },
          keyword: {
            status: 'pending',
            revision: 0,
            contentHash: '',
            lastSyncedAt: null,
            lastError: null,
          },
          graph: {
            status: 'pending',
            revision: 0,
            contentHash: '',
            lastSyncedAt: null,
            lastError: null,
          },
        },
      } as any);

      const vector = await getEntryEmbedding(entry);

      expect(vector).toEqual(cachedVector);
      expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it('returns embeddingCache vector when hash matches (legacy path)', async () => {
      const cachedVector = [0.3, 0.4, 0.5];
      const entry = createTestEntry({
        history: [{ revision: 1 } as any],
        embeddingCache: {
          textHash: 'mock-hash-123',
          vector: cachedVector,
          createdAt: '2024-01-01T00:00:00Z',
          revision: 1, // Matches history.length
        },
        indexState: null,
      } as any);

      const vector = await getEntryEmbedding(entry);

      expect(vector).toEqual(cachedVector);
      expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it('recomputes embedding when cache is stale', async () => {
      const entry = createTestEntry({
        history: [{ revision: 1 } as any, { revision: 2 } as any], // length = 2
        embeddingCache: {
          textHash: 'mock-hash-123',
          vector: [0.1, 0.2, 0.3],
          revision: 1, // stale: 1 !== 2
        },
        indexState: null,
      } as any);

      const vector = await getEntryEmbedding(entry);

      expect(generateEmbedding).toHaveBeenCalled();
      expect(vector).toEqual([0.1, 0.2, 0.3]); // from mock
    });

    it('recomputes embedding when no cache exists', async () => {
      const entry = createTestEntry({
        embeddingCache: null,
        indexState: null,
      } as any);

      const vector = await getEntryEmbedding(entry);

      expect(generateEmbedding).toHaveBeenCalled();
      expect(vector).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe('getQueryEmbedding', () => {
    it('calls generateEmbedding with query text', async () => {
      const vector = await getQueryEmbedding('JWT authentication');

      expect(generateEmbedding).toHaveBeenCalledWith('JWT authentication');
      expect(vector).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe('getBatchEmbeddings', () => {
    it('returns cached embeddings for entries with valid cache', async () => {
      vi.mocked(generateEmbedding).mockClear();
      const cachedVector = [0.5, 0.6, 0.7];
      const entry = createTestEntry({
        id: 'cached_entry',
        history: [{ revision: 1 } as any],
        embeddingCache: {
          textHash: 'mock-hash-123',
          vector: cachedVector,
          revision: 1,
        },
        indexState: null,
      } as any);

      const { embeddings, stats } = await getBatchEmbeddings([entry]);

      expect(embeddings.size).toBe(1);
      expect(embeddings.get('cached_entry')).toEqual({
        vector: cachedVector,
        fromCache: true,
      });
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(0);
      expect(stats.hitRate).toBe(1.0);
      expect(generateEmbedding).not.toHaveBeenCalled();
    });

    it('computes embeddings for cache misses', async () => {
      vi.mocked(generateEmbedding).mockClear();
      const entry = createTestEntry({
        id: 'miss_entry',
        embeddingCache: null,
        indexState: null,
      } as any);

      const { embeddings, stats } = await getBatchEmbeddings([entry]);

      expect(embeddings.size).toBe(1);
      expect(embeddings.get('miss_entry')).toEqual({
        vector: [0.1, 0.2, 0.3],
        fromCache: false,
      });
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.hitRate).toBe(0);
      expect(generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('handles mix of cached and uncached entries', async () => {
      vi.mocked(generateEmbedding).mockClear();
      const cachedEntry = createTestEntry({
        id: 'cached_entry',
        history: [{ revision: 1 } as any],
        embeddingCache: {
          textHash: 'mock-hash-123',
          vector: [0.5, 0.6, 0.7],
          revision: 1,
        },
        indexState: null,
      } as any);

      const uncachedEntry = createTestEntry({
        id: 'uncached_entry',
        embeddingCache: null,
        indexState: null,
      } as any);

      const { embeddings, stats } = await getBatchEmbeddings([cachedEntry, uncachedEntry]);

      expect(embeddings.size).toBe(2);
      expect(embeddings.get('cached_entry')?.fromCache).toBe(true);
      expect(embeddings.get('uncached_entry')?.fromCache).toBe(false);
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
      expect(generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('returns empty map and zero stats for empty entries array', async () => {
      const { embeddings, stats } = await getBatchEmbeddings([]);

      expect(embeddings.size).toBe(0);
      expect(stats.totalEntries).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('skips entries when embedding computation fails', async () => {
      vi.mocked(generateEmbedding).mockRejectedValueOnce(new Error('API error'));
      const entry = createTestEntry({
        id: 'error_entry',
        embeddingCache: null,
        indexState: null,
      } as any);

      const { embeddings, stats } = await getBatchEmbeddings([entry]);

      // Entry with failed computation should not be in the map
      expect(embeddings.has('error_entry')).toBe(false);
      expect(stats.cacheMisses).toBe(1);
    });
  });

  describe('optimizedSemanticRecall', () => {
    it('returns scored entries sorted by score descending', async () => {
      vi.mocked(generateEmbedding).mockClear();
      const entry1 = createTestEntry({
        id: 'entry_1',
        labels: ['security'],
        scope: 'global',
        embeddingCache: null,
        indexState: null,
      } as any);

      const entry2 = createTestEntry({
        id: 'entry_2',
        labels: ['security'],
        scope: 'global',
        embeddingCache: null,
        indexState: null,
      } as any);

      const queryVector = [0.1, 0.2, 0.3];
      const filters = { labels: ['security'], scopes: [] };

      const { scoredEntries, cacheStats } = await optimizedSemanticRecall(
        queryVector,
        [entry1, entry2],
        filters,
      );

      expect(scoredEntries.length).toBe(2);
      expect(scoredEntries[0]?.score).toBeGreaterThanOrEqual(scoredEntries[1]?.score ?? 0);
      expect(cacheStats.totalEntries).toBe(2);
    });

    it('applies score boosts from filters', async () => {
      vi.mocked(generateEmbedding).mockClear();
      const entry = createTestEntry({
        id: 'boosted_entry',
        labels: ['auth', 'security'],
        scope: 'project',
        embeddingCache: null,
        indexState: null,
      } as any);

      const queryVector = [0.1, 0.2, 0.3];
      const filters = { labels: ['auth'], scopes: ['project'] };

      const { scoredEntries } = await optimizedSemanticRecall(queryVector, [entry], filters);

      // Score should include label boost (0.05) and scope boost (0.03)
      // Base similarity is 1.0 (same vector), so 1.0 + 0.05 + 0.03 = 1.08 -> clamped to 1.0
      expect(scoredEntries[0]?.score).toBe(1.0);
    });

    it('includes cache statistics in result', async () => {
      const cachedEntry = createTestEntry({
        id: 'cached',
        history: [{ revision: 1 } as any],
        embeddingCache: {
          textHash: 'mock-hash-123',
          vector: [0.1, 0.2, 0.3],
          revision: 1,
        },
        indexState: null,
      } as any);

      const queryVector = [0.1, 0.2, 0.3];
      const filters = { labels: [], scopes: [] };

      const { cacheStats } = await optimizedSemanticRecall(queryVector, [cachedEntry], filters);

      expect(cacheStats.cacheHits).toBe(1);
      expect(cacheStats.hitRate).toBe(1.0);
    });

    it('handles empty entries array', async () => {
      const queryVector = [0.1, 0.2, 0.3];
      const filters = { labels: [], scopes: [] };

      const { scoredEntries, cacheStats } = await optimizedSemanticRecall(queryVector, [], filters);

      expect(scoredEntries).toEqual([]);
      expect(cacheStats.totalEntries).toBe(0);
    });
  });
});
