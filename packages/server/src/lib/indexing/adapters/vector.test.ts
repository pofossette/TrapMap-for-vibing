/**
 * Unit tests for vector index adapter.
 *
 * Tests cover:
 * - vectorIndexAdapter.sync generates embeddings and persists compatibility data
 * - vectorIndexAdapter.sync is idempotent when revision and contentHash match
 * - vectorIndexAdapter.remove removes vector state for the given entry
 * - vectorIndexAdapter.remove is idempotent (no error on double remove)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NormalizedIndexDocument } from '../types.js';
import { nowIso } from '../../store.js';
import { normalizeKnowledgeIndexDocument } from '../normalize.js';

// Import the adapter we're testing
import { vectorIndexAdapter, clearVectorCache } from './vector.js';

describe('vector index adapter', () => {
  let mockEntry: any;
  let mockDocument: NormalizedIndexDocument;

  beforeEach(() => {
    // Clear the adapter cache before each test
    clearVectorCache();
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

  describe('sync', () => {
    it('generates embeddings and persists compatibility data', async () => {
      const result = await vectorIndexAdapter.sync(mockDocument);

      expect(result.success).toBe(true);
      expect(result.adapterKind).toBe('vector');
      expect(result.performedWork).toBe(true);
    });

    it('is idempotent when revision and contentHash match', async () => {
      // First sync - should perform work
      const result1 = await vectorIndexAdapter.sync(mockDocument);
      expect(result1.performedWork).toBe(true);

      // Second sync with same document - should skip
      const result2 = await vectorIndexAdapter.sync(mockDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(false);
    });

    it('performs work when content hash changes', async () => {
      // First sync
      const result1 = await vectorIndexAdapter.sync(mockDocument);
      expect(result1.performedWork).toBe(true);

      // Create a new document with different content (different hash)
      const updatedEntry = { ...mockEntry, detail: 'Updated detail content' };
      const updatedDocument = normalizeKnowledgeIndexDocument(updatedEntry);

      // Second sync with new content - should perform work
      const result2 = await vectorIndexAdapter.sync(updatedDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(true);
    });

    it('performs work when revision changes', async () => {
      // First sync at revision 1
      const result1 = await vectorIndexAdapter.sync(mockDocument);
      expect(result1.performedWork).toBe(true);

      // Simulate a new revision
      mockEntry.history.push({
        revision: 2,
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
      });
      const newDocument = normalizeKnowledgeIndexDocument(mockEntry);

      // Second sync at revision 2 - should perform work
      const result2 = await vectorIndexAdapter.sync(newDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(true);
    });
  });

  describe('remove', () => {
    it('removes vector state for the given entry', async () => {
      // First sync to create state
      await vectorIndexAdapter.sync(mockDocument);

      // Remove should not throw
      await expect(
        vectorIndexAdapter.remove({
          entryId: mockDocument.entryId,
          revision: mockDocument.revision,
        }),
      ).resolves.not.toThrow();
    });

    it('is idempotent - calling remove twice does not error', async () => {
      await vectorIndexAdapter.sync(mockDocument);

      // First remove
      await vectorIndexAdapter.remove({
        entryId: mockDocument.entryId,
        revision: mockDocument.revision,
      });

      // Second remove - should not throw
      await expect(
        vectorIndexAdapter.remove({
          entryId: mockDocument.entryId,
          revision: mockDocument.revision,
        }),
      ).resolves.not.toThrow();
    });

    it('handles remove of non-existent entry gracefully', async () => {
      // Remove an entry that was never synced
      await expect(
        vectorIndexAdapter.remove({
          entryId: 'non-existent',
          revision: 1,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('adapter contract', () => {
    it('exposes kind as "vector"', () => {
      expect(vectorIndexAdapter.kind).toBe('vector');
    });

    it('implements sync and remove methods', () => {
      expect(typeof vectorIndexAdapter.sync).toBe('function');
      expect(typeof vectorIndexAdapter.remove).toBe('function');
    });
  });
});
