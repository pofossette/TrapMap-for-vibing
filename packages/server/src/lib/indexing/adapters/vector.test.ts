import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedIndexDocument } from '../types.js';
import { nowIso } from '../../store.js';
import { normalizeKnowledgeIndexDocument } from '../normalize.js';
import { vectorIndexAdapter } from './vector.js';

describe('vector index adapter', () => {
  let mockEntry: any;
  let mockDocument: NormalizedIndexDocument;

  beforeEach(() => {
    // Create a mock knowledge entry
    mockEntry = {
      id: 'entry_1',
      teamId: 'team_1',
      scope: 'project',
      requiredLevel: 5,
      lifecycleState: 'approved',
      history: [{ revision: 1, submittedAt: nowIso(), submittedByUserId: 'user_1' }],
      shortcut: 'Test Entry',
      detail: 'Test detail content',
      labels: ['test', 'example'],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    // Create normalized document
    mockDocument = normalizeKnowledgeIndexDocument(mockEntry);

    // Mock the generateEmbedding function
    vi.mock('../../embeddings.js', () => ({
      generateEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
    }));
  });

  describe('upsert', () => {
    it('writes fresh vectors keyed by revision and content hash', async () => {
      const result = await vectorIndexAdapter.upsert(mockEntry, mockDocument);

      expect(result.success).toBe(true);
      expect(result.performedWork).toBe(true);
      expect(mockEntry.indexState).toBeDefined();
      expect(mockEntry.indexState?.vector).toBeDefined();
      expect(mockEntry.indexState?.vector.status).toBe('synced');
      expect(mockEntry.indexState?.vector.revision).toBe(mockDocument.revision);
      expect(mockEntry.indexState?.vector.contentHash).toBe(mockDocument.contentHash);
    });

    it('skips stale rewrites when revision and content hash match', async () => {
      // First upsert - should perform work
      const result1 = await vectorIndexAdapter.upsert(mockEntry, mockDocument);
      expect(result1.performedWork).toBe(true);

      // Second upsert with same document - should skip
      const result2 = await vectorIndexAdapter.upsert(mockEntry, mockDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(false);
    });

    it('performs work when content hash changes', async () => {
      // First upsert
      const result1 = await vectorIndexAdapter.upsert(mockEntry, mockDocument);
      expect(result1.performedWork).toBe(true);

      // Create a new document with different content (different hash)
      const updatedEntry = { ...mockEntry };
      const updatedDocument = normalizeKnowledgeIndexDocument(updatedDocument);

      // Second upsert with new content - should perform work
      const result2 = await vectorIndexAdapter.upsert(updatedEntry, updatedDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(true);
    });

    it('performs work when revision changes', async () => {
      // First upsert at revision 1
      const result1 = await vectorIndexAdapter.upsert(mockEntry, mockDocument);
      expect(result1.performedWork).toBe(true);

      // Simulate a new revision
      mockEntry.history.push({
        revision: 2,
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
      });
      const newDocument = normalizeKnowledgeIndexDocument(mockEntry);

      // Second upsert at revision 2 - should perform work
      const result2 = await vectorIndexAdapter.upsert(mockEntry, newDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(true);
    });

    it('mirrors embeddingCache for compatibility during migration', async () => {
      // Before upsert, embeddingCache should be null
      expect(mockEntry.embeddingCache).toBeUndefined();

      // After upsert, embeddingCache should be populated
      await vectorIndexAdapter.upsert(mockEntry, mockDocument);
      expect(mockEntry.embeddingCache).toBeDefined();
      expect(mockEntry.embeddingCache?.vector).toBeDefined();
      expect(mockEntry.embeddingCache?.textHash).toBe(
        mockDocument.contentHash, // Uses contentHash as textHash
      );
      expect(mockEntry.embeddingCache?.revision).toBe(mockDocument.revision);
    });
  });

  describe('remove', () => {
    it('removes vector state from entry', async () => {
      // First upsert to create state
      await vectorIndexAdapter.upsert(mockEntry, mockDocument);
      expect(mockEntry.indexState?.vector).toBeDefined();

      // Remove should clear vector state
      await vectorIndexAdapter.remove(mockEntry, { entryId: mockEntry.id, revision: mockDocument.revision });

      expect(mockEntry.indexState?.vector.status).toBe('pending');
      expect(mockEntry.indexState?.vector.lastSyncedAt).toBeNull();
    });

    it('is idempotent - calling remove twice does not error', async () => {
      await vectorIndexAdapter.upsert(mockEntry, mockDocument);

      // First remove
      await vectorIndexAdapter.remove(mockEntry, { entryId: mockEntry.id, revision: mockDocument.revision });

      // Second remove - should not throw
      await expect(
        vectorIndexAdapter.remove(mockEntry, { entryId: mockEntry.id, revision: mockDocument.revision }),
      ).resolves.not.toThrow();
    });
  });
});
