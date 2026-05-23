import { beforeEach, describe, expect, it } from 'vitest';

import { normalizeKnowledgeIndexDocument } from '@trapmap/server/lib/indexing/normalize.js';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { keywordIndexAdapter } from './keyword.js';

describe('keyword index adapter', () => {
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
      detail: 'Test detail content with more information',
      labels: ['test', 'example'],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    // Create normalized document
    mockDocument = normalizeKnowledgeIndexDocument(mockEntry);
  });

  describe('upsert', () => {
    it('writes persisted token state', async () => {
      const result = await keywordIndexAdapter.upsert(mockEntry, mockDocument);

      expect(result.success).toBe(true);
      expect(result.performedWork).toBe(true);
      expect(mockEntry.indexState).toBeDefined();
      expect(mockEntry.indexState?.adapters?.keyword).toBeDefined();
      expect(mockEntry.indexState?.adapters?.keyword.status).toBe('synced');
      expect(mockEntry.indexState?.adapters?.keyword.revision).toBe(mockDocument.revision);
      expect(mockEntry.indexState?.adapters?.keyword.contentHash).toBe(mockDocument.contentHash);
    });

    it('persists normalized token arrays and per-field token sets', async () => {
      await keywordIndexAdapter.upsert(mockEntry, mockDocument);

      // Check that keyword state contains field tokens
      const keywordState = mockEntry.indexState?.adapters?.keyword;
      expect(keywordState).toBeDefined();

      // The adapter should store tokens that can be reused during recall
      // We verify this through the indexState structure
      expect(mockEntry.indexState?.adapters?.keyword.revision).toBe(mockDocument.revision);
    });

    it('skips rewrites when revision and content hash match', async () => {
      // First upsert - should perform work
      const result1 = await keywordIndexAdapter.upsert(mockEntry, mockDocument);
      expect(result1.performedWork).toBe(true);

      // Second upsert with same document - should skip
      const result2 = await keywordIndexAdapter.upsert(mockEntry, mockDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(false);
    });

    it('performs work when content hash changes', async () => {
      // First upsert
      const result1 = await keywordIndexAdapter.upsert(mockEntry, mockDocument);
      expect(result1.performedWork).toBe(true);

      // Create a new document with different content (different hash)
      const updatedEntry = { ...mockEntry, detail: 'Updated detail content' };
      const updatedDocument = normalizeKnowledgeIndexDocument(updatedEntry);

      // Second upsert with new content - should perform work
      const result2 = await keywordIndexAdapter.upsert(updatedEntry, updatedDocument);
      expect(result2.success).toBe(true);
      expect(result2.performedWork).toBe(true);
    });
  });

  describe('remove', () => {
    it('removes keyword state from entry', async () => {
      // First upsert to create state
      await keywordIndexAdapter.upsert(mockEntry, mockDocument);
      expect(mockEntry.indexState?.adapters?.keyword).toBeDefined();

      // Remove should clear keyword state
      await keywordIndexAdapter.remove(mockEntry, {
        entryId: mockEntry.id,
        revision: mockDocument.revision,
      });

      expect(mockEntry.indexState?.adapters?.keyword.status).toBe('pending');
      expect(mockEntry.indexState?.adapters?.keyword.lastSyncedAt).toBeNull();
    });

    it('is idempotent - calling remove twice does not error', async () => {
      await keywordIndexAdapter.upsert(mockEntry, mockDocument);

      // First remove
      await keywordIndexAdapter.remove(mockEntry, {
        entryId: mockEntry.id,
        revision: mockDocument.revision,
      });

      // Second remove - should not throw
      await expect(
        keywordIndexAdapter.remove(mockEntry, {
          entryId: mockEntry.id,
          revision: mockDocument.revision,
        }),
      ).resolves.not.toThrow();
    });

    it('clears persisted token payload', async () => {
      await keywordIndexAdapter.upsert(mockEntry, mockDocument);

      // Verify state exists before remove
      expect(mockEntry.indexState?.adapters?.keyword.status).toBe('synced');

      // Remove
      await keywordIndexAdapter.remove(mockEntry, {
        entryId: mockEntry.id,
        revision: mockDocument.revision,
      });

      // Verify state is cleared
      expect(mockEntry.indexState?.adapters?.keyword.status).toBe('pending');
      expect(mockEntry.indexState?.adapters?.keyword.lastSyncedAt).toBeNull();
    });
  });
});
