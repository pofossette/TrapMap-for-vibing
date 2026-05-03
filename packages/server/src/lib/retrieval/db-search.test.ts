/**
 * Unit tests for database-level vector similarity search.
 *
 * Tests cover:
 * - vectorSimilaritySearch: query construction and result parsing
 * - ensureVectorIndex: index creation
 * - hasVectorIndex: index detection
 * - formatVectorLiteral: vector formatting
 *
 * Note: These tests use mocked pg.Pool for unit testing.
 * Integration tests with a real database are in a separate test file.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { VectorSearchOptions, VectorSearchResult } from './db-search.js';
import {
  ensureVectorIndex,
  hasVectorIndex,
  dropVectorIndex,
  getVectorIndexStats,
  vectorSimilaritySearch,
  vectorSimilaritySearchWithStats,
} from './db-search.js';

// Mock the pg module
const mockQuery = vi.fn();
const mockPool = {
  query: mockQuery,
} as any;

describe('db-search', () => {
  beforeEach(() => {
    mockQuery.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('vectorSimilaritySearch', () => {
    it('returns search results ordered by similarity', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            entry_id: 'entry_1',
            similarity: 0.95,
            shortcut: 'JWT Auth',
            labels: ['security'],
            scope: 'global',
            required_level: 0,
          },
          {
            entry_id: 'entry_2',
            similarity: 0.85,
            shortcut: 'OAuth Setup',
            labels: ['auth'],
            scope: 'project',
            required_level: 1,
          },
        ],
      });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
      };

      const results = await vectorSimilaritySearch(mockPool, options);

      expect(results).toHaveLength(2);
      expect(results[0]?.entryId).toBe('entry_1');
      expect(results[0]?.similarity).toBeCloseTo(0.95);
      expect(results[1]?.entryId).toBe('entry_2');
      expect(results[1]?.similarity).toBeCloseTo(0.85);
    });

    it('includes team filter in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        teamId: 'team_123',
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('team_id IS NULL OR team_id = $1');
      expect(queryCall[1]).toContain('team_123');
    });

    it('filters global-only when teamId is null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        teamId: null,
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('team_id IS NULL');
    });

    it('includes max level filter in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        maxLevel: 2,
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('required_level <= $');
      expect(queryCall[1]).toContain(2);
    });

    it('includes scope filter in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        scope: 'project',
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain("scope = $");
      expect(queryCall[1]).toContain('project');
    });

    it('includes entry IDs filter in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
        entryIds: ['entry_1', 'entry_2'],
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('entry_id = ANY($');
    });

    it('clamps similarity to [0, 1] range', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            entry_id: 'entry_1',
            similarity: 1.5, // Above 1, should be clamped
            shortcut: 'Test',
            labels: [],
            scope: 'global',
            required_level: 0,
          },
          {
            entry_id: 'entry_2',
            similarity: -0.5, // Below 0, should be clamped
            shortcut: 'Test',
            labels: [],
            scope: 'global',
            required_level: 0,
          },
        ],
      });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
      };

      const results = await vectorSimilaritySearch(mockPool, options);

      expect(results[0]?.similarity).toBe(1); // Clamped from 1.5
      expect(results[1]?.similarity).toBe(0); // Clamped from -0.5
    });

    it('uses vector cosine distance operator in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('<=>'); // Cosine distance operator
      expect(queryCall[0]).toContain('ORDER BY'); // Should order by distance
    });

    it('applies limit in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 5,
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('LIMIT $');
      expect(queryCall[1][queryCall[1].length - 1]).toBe(5);
    });

    it('returns empty array when no results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
      };

      const results = await vectorSimilaritySearch(mockPool, options);

      expect(results).toEqual([]);
    });

    it('includes status = synced filter by default', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain("status = 'synced'");
    });
  });

  describe('vectorSimilaritySearchWithStats', () => {
    it('returns results with statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            entry_id: 'entry_1',
            similarity: 0.9,
            shortcut: 'Test',
            labels: [],
            scope: 'global',
            required_level: 0,
          },
        ],
      });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3],
        limit: 10,
      };

      const { results, stats } = await vectorSimilaritySearchWithStats(mockPool, options);

      expect(results).toHaveLength(1);
      expect(stats.latencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.indexUsed).toBe(true);
      expect(stats.candidatesScanned).toBe(1);
    });
  });

  describe('ensureVectorIndex', () => {
    it('creates HNSW index with correct parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await ensureVectorIndex(mockPool);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('CREATE INDEX IF NOT EXISTS');
      expect(queryCall[0]).toContain('knowledge_embeddings_vector_idx');
      expect(queryCall[0]).toContain('USING hnsw');
      expect(queryCall[0]).toContain('vector_cosine_ops');
      expect(queryCall[0]).toContain('m = 16');
      expect(queryCall[0]).toContain('ef_construction = 64');
    });
  });

  describe('dropVectorIndex', () => {
    it('drops the index if it exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dropVectorIndex(mockPool);

      const queryCall = mockQuery.mock.calls[0];
      expect(queryCall[0]).toContain('DROP INDEX IF EXISTS knowledge_embeddings_vector_idx');
    });
  });

  describe('hasVectorIndex', () => {
    it('returns true when index exists', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ exists: true }],
      });

      const result = await hasVectorIndex(mockPool);

      expect(result).toBe(true);
    });

    it('returns false when index does not exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ exists: false }],
      });

      const result = await hasVectorIndex(mockPool);

      expect(result).toBe(false);
    });
  });

  describe('getVectorIndexStats', () => {
    it('returns stats when index exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // hasVectorIndex
        .mockResolvedValueOnce({ rows: [{ pg_size_pretty: '128 kB' }] }) // size
        .mockResolvedValueOnce({ rows: [{ count: 1000 }] }); // count

      const stats = await getVectorIndexStats(mockPool);

      expect(stats).toEqual({
        indexSize: '128 kB',
        rowCount: 1000,
      });
    });

    it('returns null when index does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

      const stats = await getVectorIndexStats(mockPool);

      expect(stats).toBeNull();
    });
  });

  describe('vector formatting', () => {
    it('formats vector correctly in query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const options: VectorSearchOptions = {
        queryVector: [0.1, 0.2, 0.3, 0.4],
        limit: 10,
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      // Vector should be formatted as [0.1,0.2,0.3,0.4]
      expect(queryCall[1]).toContain('[0.1,0.2,0.3,0.4]');
    });

    it('handles 384-dimensional vectors', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Generate a 384-dimensional vector (the actual dimension used)
      const vector = new Array(384).fill(0).map((_, i) => i / 384);
      const options: VectorSearchOptions = {
        queryVector: vector,
        limit: 10,
      };

      await vectorSimilaritySearch(mockPool, options);

      const queryCall = mockQuery.mock.calls[0];
      // Check that the vector was properly formatted (contains the array literal)
      expect(queryCall[0]).toContain('::vector');
    });
  });
});
