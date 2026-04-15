/**
 * Graph-assisted recall tests for bounded expansion and hidden-match discovery.
 *
 * Tests cover:
 * - Query entity extraction from search seed
 * - One-hop bounded expansion through graph relationships
 * - Graph-derived entry IDs intersected with eligible entry set
 * - Authorization-safe graph recall (unauthorized entries never appear)
 * - Indirect but related entries can supplement direct matches
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '../../store.js';
import { graphAssistedRecall } from './graph-assisted.js';
import { clearGraphCache, getGlobalGraphIndex, type PersistedGraphState } from '../../indexing/adapters/graph.js';
import type { GraphEntity, GraphRelation } from '../../indexing/adapters/graph.js';

/**
 * Create a mock knowledge record for testing.
 */
function createMockEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: overrides.id || 'entry-1',
    teamId: overrides.teamId || null,
    scope: overrides.scope || 'global',
    labels: overrides.labels || ['test'],
    shortcut: overrides.shortcut || 'Test shortcut',
    detail: overrides.detail || 'Test detail',
    requiredLevel: overrides.requiredLevel ?? 0,
    lifecycleState: overrides.lifecycleState || 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedByUserId: 'user-1',
      shortcut: 'Test shortcut',
      detail: 'Test detail',
      labels: ['test'],
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
    reviewerDecision: null,
    indexState: {
      contentHash: 'hash-1',
      normalizedAt: '2024-01-01T00:00:00Z',
      vector: { status: 'synced', revision: 1, contentHash: 'hash-1', lastSyncedAt: null, lastError: null },
      keyword: { status: 'synced', revision: 1, contentHash: 'hash-1', lastSyncedAt: null, lastError: null },
      graph: { status: 'synced', revision: 1, contentHash: 'hash-1', lastSyncedAt: null, lastError: null },
    },
    ...overrides,
  };
}

/**
 * Setup graph index with test data.
 */
function setupGraphIndex(entries: Map<string, PersistedGraphState>): void {
  const globalIndex = getGlobalGraphIndex();

  // Clear existing data
  clearGraphCache();

  // Populate graph index
  for (const [entryId, graphState] of entries.entries()) {
    // Add entities to global index
    for (const entity of graphState.entities) {
      if (!globalIndex.entities.has(entity.normalizedValue)) {
        globalIndex.entities.set(entity.normalizedValue, new Set());
      }
      globalIndex.entities.get(entity.normalizedValue)!.add(entryId);
    }

    // Add relations
    globalIndex.relations.set(entryId, graphState.relations);
  }
}

describe('graph-assisted recall', () => {
  beforeEach(() => {
    // Clear graph cache before each test
    clearGraphCache();
  });

  describe('query entity extraction', () => {
    it('extracts entities from query seed using shared extraction logic', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();
      const entry = createMockEntry({
        id: 'entry-1',
        shortcut: 'Docker timeout error',
        detail: 'Container crashes due to memory limit',
        labels: ['docker', 'timeout'],
      });
      eligibleEntries.set(entry.id, entry);

      // Setup graph index for this entry
      const graphState: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [
          { type: 'tool', value: 'docker', normalizedValue: 'docker' },
          { type: 'symptom', value: 'timeout', normalizedValue: 'timeout' },
          { type: 'symptom', value: 'crash', normalizedValue: 'crash' },
        ],
        relations: [
          { type: 'observed-in', fromEntity: 'docker', toEntity: 'timeout', weight: 1 },
          { type: 'observed-in', fromEntity: 'docker', toEntity: 'crash', weight: 1 },
        ],
        contentHash: 'hash-1',
      };
      setupGraphIndex(new Map([['entry-1', graphState]]));

      const candidates = await graphAssistedRecall('docker timeout', eligibleEntries);

      // Should return entry matching query entities
      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.id).toBe('entry-1');
      expect(candidates[0].channel).toBe('graph');
      expect(candidates[0].score).toBeGreaterThan(0);
    });

    it('handles empty query gracefully', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();
      const candidates = await graphAssistedRecall('', eligibleEntries);

      expect(candidates).toEqual([]);
    });

    it('extracts multiple entity types from complex query', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();
      const entry = createMockEntry({
        id: 'entry-1',
        shortcut: 'Fix PostgreSQL connection timeout',
        detail: 'Use connection pooling and increase timeout',
        labels: ['database', 'fix'],
      });
      eligibleEntries.set(entry.id, entry);

      const graphState: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [
          { type: 'service', value: 'PostgreSQL', normalizedValue: 'postgresql' },
          { type: 'symptom', value: 'timeout', normalizedValue: 'timeout' },
          { type: 'fix', value: 'use', normalizedValue: 'use' },
          { type: 'tool', value: 'connection pooling', normalizedValue: 'connection-pooling' },
        ],
        relations: [],
        contentHash: 'hash-1',
      };
      setupGraphIndex(new Map([['entry-1', graphState]]));

      const candidates = await graphAssistedRecall('PostgreSQL timeout fix', eligibleEntries);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.id).toBe('entry-1');
    });
  });

  describe('one-hop bounded expansion', () => {
    it('expands one hop through entity relationships', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      // Entry 1: Direct match for "docker"
      const entry1 = createMockEntry({
        id: 'entry-1',
        shortcut: 'Docker installation guide',
        detail: 'How to install Docker',
      });
      eligibleEntries.set(entry1.id, entry1);

      // Entry 2: Related to entry1 via "docker" entity but no direct match
      const entry2 = createMockEntry({
        id: 'entry-2',
        shortcut: 'Container crash fix',
        detail: 'Fix memory limit in containers',
      });
      eligibleEntries.set(entry2.id, entry2);

      // Setup graph: entry1 has "docker" entity, entry2 has "crash" entity
      // They're connected through a relation: docker -> crash
      const graphState1: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'tool', value: 'docker', normalizedValue: 'docker' }],
        relations: [],
        contentHash: 'hash-1',
      };

      const graphState2: PersistedGraphState = {
        entryId: 'entry-2',
        revision: 1,
        entities: [
          { type: 'symptom', value: 'crash', normalizedValue: 'crash' },
          { type: 'environment', value: 'container', normalizedValue: 'container' },
        ],
        relations: [
          { type: 'observed-in', fromEntity: 'docker', toEntity: 'crash', weight: 1 },
        ],
        contentHash: 'hash-2',
      };

      setupGraphIndex(new Map([
        ['entry-1', graphState1],
        ['entry-2', graphState2],
      ]));

      const candidates = await graphAssistedRecall('docker', eligibleEntries);

      // Should return both entries: entry1 (direct match) and entry2 (one-hop via relation)
      expect(candidates.length).toBeGreaterThan(0);
      const entryIds = candidates.map((c) => c.entry.id);
      expect(entryIds).toContain('entry-1');
      expect(entryIds).toContain('entry-2');
    });

    it('limits expansion to one hop (no multi-hop traversal)', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      // entry1 -> entry2 via relation1
      // entry2 -> entry3 via relation2
      // Query matching entry1 should NOT return entry3 (two hops away)
      const entry1 = createMockEntry({ id: 'entry-1', shortcut: 'Docker setup' });
      const entry2 = createMockEntry({ id: 'entry-2', shortcut: 'Container crash' });
      const entry3 = createMockEntry({ id: 'entry-3', shortcut: 'Memory leak fix' });

      eligibleEntries.set(entry1.id, entry1);
      eligibleEntries.set(entry2.id, entry2);
      eligibleEntries.set(entry3.id, entry3);

      // Graph: docker -> crash (entry1 to entry2), crash -> leak (entry2 to entry3)
      const graphState1: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'tool', value: 'docker', normalizedValue: 'docker' }],
        relations: [],
        contentHash: 'hash-1',
      };

      const graphState2: PersistedGraphState = {
        entryId: 'entry-2',
        revision: 1,
        entities: [{ type: 'symptom', value: 'crash', normalizedValue: 'crash' }],
        relations: [
          { type: 'observed-in', fromEntity: 'docker', toEntity: 'crash', weight: 1 },
        ],
        contentHash: 'hash-2',
      };

      const graphState3: PersistedGraphState = {
        entryId: 'entry-3',
        revision: 1,
        entities: [{ type: 'symptom', value: 'leak', normalizedValue: 'leak' }],
        relations: [
          { type: 'causes', fromEntity: 'crash', toEntity: 'leak', weight: 1 },
        ],
        contentHash: 'hash-3',
      };

      setupGraphIndex(new Map([
        ['entry-1', graphState1],
        ['entry-2', graphState2],
        ['entry-3', graphState3],
      ]));

      const candidates = await graphAssistedRecall('docker', eligibleEntries);

      const entryIds = candidates.map((c) => c.entry.id);
      expect(entryIds).toContain('entry-1'); // Direct match
      expect(entryIds).toContain('entry-2'); // One hop
      expect(entryIds).not.toContain('entry-3'); // Two hops - should not appear
    });
  });

  describe('authorization safety', () => {
    it('intersects graph-derived entries with eligible entry set', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      // Only entry-1 is eligible
      const entry1 = createMockEntry({
        id: 'entry-1',
        shortcut: 'Docker timeout fix',
        lifecycleState: 'approved',
      });
      eligibleEntries.set(entry1.id, entry1);

      // entry-2 is NOT in eligible set (e.g., wrong team, not approved, etc.)
      // but exists in graph index with strong relationships
      const entry2 = createMockEntry({
        id: 'entry-2',
        shortcut: 'Related container crash',
        lifecycleState: 'pending', // Not approved
      });

      // Setup graph with strong relation between entry1 and entry2
      const graphState1: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'tool', value: 'docker', normalizedValue: 'docker' }],
        relations: [],
        contentHash: 'hash-1',
      };

      const graphState2: PersistedGraphState = {
        entryId: 'entry-2',
        revision: 1,
        entities: [{ type: 'symptom', value: 'crash', normalizedValue: 'crash' }],
        relations: [
          { type: 'observed-in', fromEntity: 'docker', toEntity: 'crash', weight: 10 },
        ],
        contentHash: 'hash-2',
      };

      setupGraphIndex(new Map([
        ['entry-1', graphState1],
        ['entry-2', graphState2],
      ]));

      const candidates = await graphAssistedRecall('docker crash', eligibleEntries);

      // Should only return entry-1 (eligible), not entry-2 (not eligible)
      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.id).toBe('entry-1');
    });

    it('never returns entries outside eligible set even with strong graph links', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      const entry1 = createMockEntry({
        id: 'entry-1',
        shortcut: 'TypeScript error',
        requiredLevel: 0, // Low security level
      });
      eligibleEntries.set(entry1.id, entry1);

      // entry-2 has high requiredLevel (not eligible for level-0 user)
      // but has very strong graph relationship with entry1
      const entry2 = createMockEntry({
        id: 'entry-2',
        shortcut: 'Advanced TypeScript patterns',
        requiredLevel: 10, // High security level
      });

      const graphState1: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'service', value: 'TypeScript', normalizedValue: 'typescript' }],
        relations: [],
        contentHash: 'hash-1',
      };

      const graphState2: PersistedGraphState = {
        entryId: 'entry-2',
        revision: 1,
        entities: [{ type: 'service', value: 'TypeScript', normalizedValue: 'typescript' }],
        relations: [
          { type: 'mentions', fromEntity: 'typescript', toEntity: 'typescript', weight: 100 },
        ],
        contentHash: 'hash-2',
      };

      setupGraphIndex(new Map([
        ['entry-1', graphState1],
        ['entry-2', graphState2],
      ]));

      const candidates = await graphAssistedRecall('TypeScript', eligibleEntries);

      // Should only return entry-1 (level-0 user cannot see entry-2)
      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.id).toBe('entry-1');
      expect(candidates[0].entry.id).not.toBe('entry-2');
    });
  });

  describe('hidden-match discovery', () => {
    it('surfaces indirectly related entries when relationship signal is strong', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      // entry-1: Direct match for "timeout"
      const entry1 = createMockEntry({
        id: 'entry-1',
        shortcut: 'Request timeout error',
        detail: 'HTTP requests timing out after 30 seconds',
      });
      eligibleEntries.set(entry1.id, entry1);

      // entry-2: No direct text match but related via graph
      const entry2 = createMockEntry({
        id: 'entry-2',
        shortcut: 'Connection pool exhaustion',
        detail: 'Database connection pool runs out',
      });
      eligibleEntries.set(entry2.id, entry2);

      // Graph: timeout (entry1) -> fixed-by -> connection pool (entry2)
      const graphState1: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'symptom', value: 'timeout', normalizedValue: 'timeout' }],
        relations: [],
        contentHash: 'hash-1',
      };

      const graphState2: PersistedGraphState = {
        entryId: 'entry-2',
        revision: 1,
        entities: [
          { type: 'tool', value: 'connection pool', normalizedValue: 'connection-pool' },
          { type: 'symptom', value: 'exhaustion', normalizedValue: 'exhaustion' },
        ],
        relations: [
          { type: 'fixed-by', fromEntity: 'timeout', toEntity: 'connection-pool', weight: 5 },
        ],
        contentHash: 'hash-2',
      };

      setupGraphIndex(new Map([
        ['entry-1', graphState1],
        ['entry-2', graphState2],
      ]));

      const candidates = await graphAssistedRecall('timeout', eligibleEntries);

      const entryIds = candidates.map((c) => c.entry.id);
      expect(entryIds).toContain('entry-1'); // Direct match
      expect(entryIds).toContain('entry-2'); // Hidden match via strong relation
    });

    it('ranks graph candidates by combined entity match and relation strength', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      const entry1 = createMockEntry({ id: 'entry-1', shortcut: 'Docker crash' });
      const entry2 = createMockEntry({ id: 'entry-2', shortcut: 'Container restart' });
      const entry3 = createMockEntry({ id: 'entry-3', shortcut: 'Kubernetes pod' });

      eligibleEntries.set(entry1.id, entry1);
      eligibleEntries.set(entry2.id, entry2);
      eligibleEntries.set(entry3.id, entry3);

      // Graph: docker directly matches query
      // entry2 related to docker via weak relation
      // entry3 related to docker via strong relation
      const graphState1: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'tool', value: 'docker', normalizedValue: 'docker' }],
        relations: [],
        contentHash: 'hash-1',
      };

      const graphState2: PersistedGraphState = {
        entryId: 'entry-2',
        revision: 1,
        entities: [{ type: 'environment', value: 'container', normalizedValue: 'container' }],
        relations: [
          { type: 'runs-in', fromEntity: 'container', toEntity: 'docker', weight: 1 },
        ],
        contentHash: 'hash-2',
      };

      const graphState3: PersistedGraphState = {
        entryId: 'entry-3',
        revision: 1,
        entities: [{ type: 'tool', value: 'kubernetes', normalizedValue: 'kubernetes' }],
        relations: [
          { type: 'uses-tool', fromEntity: 'kubernetes', toEntity: 'docker', weight: 10 },
        ],
        contentHash: 'hash-3',
      };

      setupGraphIndex(new Map([
        ['entry-1', graphState1],
        ['entry-2', graphState2],
        ['entry-3', graphState3],
      ]));

      const candidates = await graphAssistedRecall('docker', eligibleEntries);

      // Entry with direct match should rank highest
      // Entry with stronger relation should rank higher than weak relation
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].entry.id).toBe('entry-1'); // Direct match

      // Find positions of entry2 and entry3
      const entry2Index = candidates.findIndex((c) => c.entry.id === 'entry-2');
      const entry3Index = candidates.findIndex((c) => c.entry.id === 'entry-3');

      // Both should be present
      expect(entry2Index).toBeGreaterThanOrEqual(0);
      expect(entry3Index).toBeGreaterThanOrEqual(0);

      // Entry3 (stronger relation) should rank higher than entry2 (weaker relation)
      expect(entry3Index).toBeLessThan(entry2Index);
    });
  });

  describe('scoring', () => {
    it('assigns higher score for direct entity matches', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      const entry1 = createMockEntry({ id: 'entry-1', shortcut: 'Docker error' });
      eligibleEntries.set(entry1.id, entry1);

      const graphState: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'tool', value: 'docker', normalizedValue: 'docker' }],
        relations: [],
        contentHash: 'hash-1',
      };

      setupGraphIndex(new Map([['entry-1', graphState]]));

      const candidates = await graphAssistedRecall('docker', eligibleEntries);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].score).toBeGreaterThan(0);
      expect(candidates[0].score).toBeLessThanOrEqual(1);
    });

    it('boosts score based on relation support count', async () => {
      const eligibleEntries = new Map<string, KnowledgeRecord>();

      const entry1 = createMockEntry({ id: 'entry-1', shortcut: 'Docker crash' });
      const entry2 = createMockEntry({ id: 'entry-2', shortcut: 'Container error' });

      eligibleEntries.set(entry1.id, entry1);
      eligibleEntries.set(entry2.id, entry2);

      // entry1 has multiple relations supporting it
      const graphState1: PersistedGraphState = {
        entryId: 'entry-1',
        revision: 1,
        entities: [{ type: 'tool', value: 'docker', normalizedValue: 'docker' }],
        relations: [
          { type: 'observed-in', fromEntity: 'docker', toEntity: 'crash', weight: 5 },
          { type: 'uses-tool', fromEntity: 'crash', toEntity: 'docker', weight: 3 },
        ],
        contentHash: 'hash-1',
      };

      const graphState2: PersistedGraphState = {
        entryId: 'entry-2',
        revision: 1,
        entities: [{ type: 'environment', value: 'container', normalizedValue: 'container' }],
        relations: [
          { type: 'runs-in', fromEntity: 'container', toEntity: 'docker', weight: 1 },
        ],
        contentHash: 'hash-2',
      };

      setupGraphIndex(new Map([
        ['entry-1', graphState1],
        ['entry-2', graphState2],
      ]));

      const candidates = await graphAssistedRecall('docker', eligibleEntries);

      // entry1 should have higher score due to more relation support
      const entry1Candidate = candidates.find((c) => c.entry.id === 'entry-1');
      const entry2Candidate = candidates.find((c) => c.entry.id === 'entry-2');

      expect(entry1Candidate).toBeDefined();
      expect(entry2Candidate).toBeDefined();
      expect(entry1Candidate!.score).toBeGreaterThan(entry2Candidate!.score);
    });
  });
});
