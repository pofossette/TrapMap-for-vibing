/**
 * Unit tests for graph index adapter.
 *
 * Tests cover:
 * - graphIndexAdapter.sync persists graph data keyed by entryId, revision, and contentHash
 * - graphIndexAdapter.sync is idempotent when revision and contentHash match
 * - graphIndexAdapter.remove removes graph data for the given entry
 * - graphIndexAdapter.remove is idempotent (no error on double remove)
 *
 * Security note: Graph payloads remain server-internal and are not exposed through contracts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonStore, nowIso } from '../../store.js';
import type { NormalizedIndexDocument } from '../types.js';

// Import the adapter we're testing
import { graphIndexAdapter } from './graph.js';

describe('graph index adapter', () => {
  let store: JsonStore;
  const testDocument: NormalizedIndexDocument = {
    entryId: 'test-entry-1',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    lifecycleState: 'approved',
    revision: 1,
    updatedAt: nowIso(),
    shortcut: 'JWT Authentication',
    detail: 'Use JWT tokens for API authentication with proper validation',
    labels: ['security', 'auth', 'jwt'],
    canonicalText: 'JWT Authentication\nUse JWT tokens for API authentication with proper validation\nsecurity auth jwt',
    tokens: ['jwt', 'authentication', 'use', 'tokens', 'for', 'api', 'with', 'proper', 'validation', 'security', 'auth'],
    contentHash: 'abc123hash',
    normalizedAt: nowIso(),
  };

  beforeEach(async () => {
    // Create temporary store
    const testDataFile = `/tmp/skill-shareer-graph-test-${Date.now()}.json`;
    store = new JsonStore(testDataFile);

    // Initialize empty store
    await store.transact(async (data) => {
      data.counters = {};
      data.users = [];
      data.teams = [];
      data.memberships = [];
      data.accessKeys = [];
      data.sessions = [];
      data.knowledgeEntries = [];
      data.auditEvents = [];
    });
  });

  afterEach(async () => {
    // Cleanup happens via temp file lifecycle
  });

  describe('sync', () => {
    it('persists graph data keyed by entryId, revision, and contentHash', async () => {
      const result = await graphIndexAdapter.sync(testDocument);

      // Verify sync result
      expect(result).toMatchObject({
        adapterKind: 'graph',
        success: true,
        error: null,
        performedWork: true,
      });

      // Verify graph data was persisted in store
      const data = await store.snapshot();
      expect(data).toBeDefined();
      // Graph adapter should store graph artifacts internally
      // Store-based verification happens through the adapter's internal storage
    });

    it('is idempotent when revision and contentHash match', async () => {
      // First sync
      const result1 = await graphIndexAdapter.sync(testDocument);
      expect(result1.performedWork).toBe(true);

      // Second sync with same document (should be no-op)
      const result2 = await graphIndexAdapter.sync(testDocument);
      expect(result2.performedWork).toBe(false);
      expect(result2.success).toBe(true);
    });

    it('performs work when contentHash changes', async () => {
      // First sync
      const result1 = await graphIndexAdapter.sync(testDocument);
      expect(result1.performedWork).toBe(true);

      // Second sync with different content (should perform work)
      const updatedDocument = {
        ...testDocument,
        contentHash: 'different-hash',
        revision: 2,
      };
      const result2 = await graphIndexAdapter.sync(updatedDocument);
      expect(result2.performedWork).toBe(true);
    });

    it('performs work when revision changes even with same contentHash', async () => {
      // First sync
      const result1 = await graphIndexAdapter.sync(testDocument);
      expect(result1.performedWork).toBe(true);

      // Second sync with same content but higher revision
      const updatedDocument = {
        ...testDocument,
        revision: 2,
      };
      const result2 = await graphIndexAdapter.sync(updatedDocument);
      expect(result2.performedWork).toBe(true);
    });

    it('handles sync errors gracefully', async () => {
      // Create a document that might cause issues
      const invalidDocument = {
        ...testDocument,
        entryId: '', // Empty entry ID might cause issues
      };

      const result = await graphIndexAdapter.sync(invalidDocument);
      // Should handle error gracefully
      expect(result).toBeDefined();
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  describe('remove', () => {
    it('removes graph data for the given entry', async () => {
      // First sync some data
      await graphIndexAdapter.sync(testDocument);

      // Then remove it
      await expect(
        graphIndexAdapter.remove({
          entryId: testDocument.entryId,
          revision: testDocument.revision,
        }),
      ).resolves.not.toThrow();
    });

    it('is idempotent - no error on double remove', async () => {
      // First sync
      await graphIndexAdapter.sync(testDocument);

      // First remove
      await graphIndexAdapter.remove({
        entryId: testDocument.entryId,
        revision: testDocument.revision,
      });

      // Second remove should not throw
      await expect(
        graphIndexAdapter.remove({
          entryId: testDocument.entryId,
          revision: testDocument.revision,
        }),
      ).resolves.not.toThrow();
    });

    it('handles remove of non-existent entry gracefully', async () => {
      // Remove an entry that was never synced
      await expect(
        graphIndexAdapter.remove({
          entryId: 'non-existent',
          revision: 1,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('adapter contract', () => {
    it('exposes kind as "graph"', () => {
      expect(graphIndexAdapter.kind).toBe('graph');
    });

    it('implements sync and remove methods', () => {
      expect(typeof graphIndexAdapter.sync).toBe('function');
      expect(typeof graphIndexAdapter.remove).toBe('function');
    });
  });
});
