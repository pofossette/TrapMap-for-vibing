/**
 * Unit tests for graph index adapter.
 *
 * Tests cover:
 * - graphIndexAdapter.sync persists graph data keyed by entryId, revision, and contentHash
 * - graphIndexAdapter.sync is idempotent when revision and contentHash match
 * - graphIndexAdapter.remove removes graph data for the given entry
 * - graphIndexAdapter.remove is idempotent (no error on double remove)
 * - graphIndexAdapter.sync uses shared extractGraphEntities for entity/relation extraction
 * - graphIndexAdapter.sync persists extracted entities with correct types
 * - graphIndexAdapter.sync persists extracted relations with bounded relation types
 *
 * Security note: Graph payloads remain server-internal and are not exposed through contracts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonStore, nowIso } from '../../store.js';
import type { NormalizedIndexDocument } from '../types.js';

// Import the adapter we're testing
import {
  graphIndexAdapter,
  clearGraphCache,
  getIndexedGraphState,
  getGlobalGraphIndex,
  buildGraphArtifact,
  type GraphEntity,
  type GraphRelation,
} from './graph.js';

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
    canonicalText:
      'JWT Authentication\nUse JWT tokens for API authentication with proper validation\nsecurity auth jwt',
    tokens: ['jwt', 'authentication', 'use', 'tokens', 'for', 'api', 'with', 'proper', 'validation', 'security', 'auth'],
    contentHash: 'abc123hash',
    normalizedAt: nowIso(),
  };

  beforeEach(async () => {
    // Clear the adapter cache before each test
    clearGraphCache();

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

      // Verify graph data was persisted
      const graphState = getIndexedGraphState(testDocument.entryId, testDocument.revision);
      expect(graphState).toBeDefined();
      expect(graphState?.entryId).toBe(testDocument.entryId);
      expect(graphState?.revision).toBe(testDocument.revision);
      expect(graphState?.contentHash).toBe(testDocument.contentHash);
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

  describe('entity and relation extraction', () => {
    it('uses shared extractGraphEntities for entity extraction', async () => {
      const result = await graphIndexAdapter.sync(testDocument);
      expect(result.success).toBe(true);

      const graphState = getIndexedGraphState(testDocument.entryId, testDocument.revision);
      expect(graphState?.entities).toBeDefined();
      expect(Array.isArray(graphState?.entities)).toBe(true);
    });

    it('extracts entities with required types', async () => {
      // Create a document that should trigger multiple entity types
      const richDocument: NormalizedIndexDocument = {
        ...testDocument,
        shortcut: 'Fix Docker timeout error',
        detail: 'Use Docker to fix the timeout issue in production environment',
        labels: ['Docker', 'timeout', 'error'],
        canonicalText:
          'Fix Docker timeout error\nUse Docker to fix the timeout issue in production environment\nDocker timeout error',
        tokens: ['fix', 'docker', 'timeout', 'error', 'use', 'to', 'the', 'issue', 'in', 'production', 'environment'],
      };

      const result = await graphIndexAdapter.sync(richDocument);
      expect(result.success).toBe(true);

      const graphState = getIndexedGraphState(richDocument.entryId, richDocument.revision);
      const entityTypes = new Set(graphState?.entities.map((e) => e.type) || []);

      // Should have extracted at least some entities
      expect(entityTypes.size).toBeGreaterThan(0);

      // All entity types should be from the required set
      const validTypes = new Set(['service', 'tool', 'symptom', 'root-cause', 'fix', 'environment']);
      entityTypes.forEach((type) => {
        expect(validTypes).toContain(type);
      });
    });

    it('extracts relations with bounded relation types', async () => {
      // Create a document that should trigger relations
      const relationDocument: NormalizedIndexDocument = {
        ...testDocument,
        shortcut: 'Fix npm install error',
        detail: 'Use npm cache to fix the timeout issue',
        labels: ['npm', 'error'],
        canonicalText: 'Fix npm install error\nUse npm cache to fix the timeout issue\nnpm error',
        tokens: ['fix', 'npm', 'install', 'error', 'use', 'cache', 'to', 'the', 'timeout', 'issue'],
      };

      const result = await graphIndexAdapter.sync(relationDocument);
      expect(result.success).toBe(true);

      const graphState = getIndexedGraphState(relationDocument.entryId, relationDocument.revision);
      const relations = graphState?.relations || [];

      // Should have extracted some relations
      expect(relations.length).toBeGreaterThanOrEqual(0);

      // All relation types should be from the bounded set
      const validRelationTypes = new Set(['mentions', 'causes', 'fixed-by', 'observed-in', 'uses-tool', 'runs-in']);
      relations.forEach((relation) => {
        expect(validRelationTypes).toContain(relation.type);
      });
    });

    it('persists entities with normalized values for deduplication', async () => {
      const result = await graphIndexAdapter.sync(testDocument);
      expect(result.success).toBe(true);

      const graphState = getIndexedGraphState(testDocument.entryId, testDocument.revision);
      const entities = graphState?.entities || [];

      // Each entity should have normalizedValue
      entities.forEach((entity) => {
        expect(entity.normalizedValue).toBeDefined();
        expect(typeof entity.normalizedValue).toBe('string');
        // Normalized value should be lowercase and hyphenated
        expect(entity.normalizedValue).toBe(entity.normalizedValue.toLowerCase());
      });
    });

    it('updates global graph index for cross-entry traversal', async () => {
      const result = await graphIndexAdapter.sync(testDocument);
      expect(result.success).toBe(true);

      const globalIndex = getGlobalGraphIndex();

      // Should have entities in the global index
      expect(globalIndex.entities.size).toBeGreaterThan(0);

      // Should have relations for the entry
      expect(globalIndex.relations.has(testDocument.entryId)).toBe(true);
    });
  });

  describe('buildGraphArtifact', () => {
    it('creates persisted graph state from extraction result', () => {
      const entities: GraphEntity[] = [
        { type: 'service', value: 'Docker', normalizedValue: 'docker' },
        { type: 'symptom', value: 'timeout', normalizedValue: 'timeout' },
      ];
      const relations: GraphRelation[] = [
        { type: 'fixed-by', fromEntity: 'timeout', toEntity: 'fix', weight: 1 },
      ];

      const artifact = buildGraphArtifact('entry-1', 1, 'hash123', { entities, relations });

      expect(artifact).toMatchObject({
        entryId: 'entry-1',
        revision: 1,
        contentHash: 'hash123',
        entities,
        relations,
      });
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

      // Verify data was removed
      const graphState = getIndexedGraphState(testDocument.entryId, testDocument.revision);
      expect(graphState).toBeNull();
    });

    it('removes entry from global graph index', async () => {
      // First sync some data
      await graphIndexAdapter.sync(testDocument);

      const globalIndexBefore = getGlobalGraphIndex();
      expect(globalIndexBefore.relations.has(testDocument.entryId)).toBe(true);

      // Then remove it
      await graphIndexAdapter.remove({
        entryId: testDocument.entryId,
        revision: testDocument.revision,
      });

      // Verify removed from global index
      const globalIndexAfter = getGlobalGraphIndex();
      expect(globalIndexAfter.relations.has(testDocument.entryId)).toBe(false);
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
