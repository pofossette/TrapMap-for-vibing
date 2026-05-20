/**
 * Tests for PgKnowledgeRepository.
 *
 * Covers:
 * - nextId() unique ID generation
 * - insert and getById round-trip
 * - updateLifecycle with valid/invalid transitions
 * - appendRevision
 * - listByFilter with various filters
 * - Index table compatibility
 */

import type { Boundary } from '@trapmap/contracts';
import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  MaintenanceMetaRecord,
} from '../store.js';
import { nowIso } from '../store.js';
import { PgKnowledgeRepository } from './pg-repository.js';

// Skip tests if no DATABASE_URL
const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let pool: Pool | null = null;

async function getPool(): Promise<Pool | null> {
  if (!DATABASE_URL) return null;
  if (pool) return pool;
  pool = new PgPool({ connectionString: DATABASE_URL });
  return pool;
}

// Helper to create minimal knowledge record
function createTestEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  const now = nowIso();
  return {
    id: 'knowledge_test_1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    shortcut: 'Test shortcut',
    detail: 'Test detail',
    requiredLevel: 0,
    lifecycleState: 'submitted',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user_1',
      shortcut: 'Test shortcut',
      detail: 'Test detail',
      labels: ['test'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: now,
        submittedByUserId: 'user_1',
        shortcut: 'Test shortcut',
        detail: 'Test detail',
        labels: ['test'],
        reviewNotes: [],
      },
    ],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: now,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [
      {
        id: 'le_1',
        type: 'submitted',
        createdAt: now,
        actorUserId: 'user_1',
        submissionId: null,
        revision: 1,
        state: 'submitted',
        note: null,
      },
    ],
    embeddingCache: null,
    indexState: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Helper to create a test boundary
function createTestBoundary(): Boundary {
  return {
    context: ['frontend', 'production'],
    versions: [{ package: 'react', range: '>=18.0.0', note: 'React 18+' }],
    prerequisites: [{ description: 'Node.js 18+', kind: 'environment', required: true }],
    signals: [{ pattern: 'useEffect', kind: 'keyword', description: 'React hook' }],
    exclusions: [{ description: 'Not for SSR', kind: 'platform' }],
    evidence: [{ kind: 'documentation', identifier: 'react-docs', url: 'https://react.dev', note: 'Official docs' }],
  };
}

// Helper to create a test maintenance meta
function createTestMaintenanceMeta(): MaintenanceMetaRecord {
  return {
    maintainerUserId: 'user_maintainer_1',
    maintainerHandle: 'maintainer_alice',
    maintainerLevel: 5,
    reviewBy: '2026-12-31T23:59:59.000Z',
  };
}

describeIfDb('PgKnowledgeRepository', () => {
  let repository: PgKnowledgeRepository;
  let testPool: Pool;

  beforeAll(async () => {
    testPool = (await getPool()) as Pool;
    repository = new PgKnowledgeRepository(testPool);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await testPool.query("DELETE FROM knowledge_entries WHERE id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_revisions WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM lifecycle_events WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_labels WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_boundary_contexts WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_boundary_versions WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_boundary_prerequisites WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_boundary_signals WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_boundary_exclusions WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_boundary_evidence WHERE entry_id LIKE 'knowledge_test_%'");
    await testPool.query("DELETE FROM knowledge_maintenance_assignments WHERE entry_id LIKE 'knowledge_test_%'");
  });

  describe('nextId()', () => {
    it('should generate unique IDs via nextId()', async () => {
      const ids = new Set<string>();

      // Generate 10 IDs
      for (let i = 0; i < 10; i++) {
        const id = await repository.nextId();
        expect(id).toMatch(/^knowledge_\d+$/);
        ids.add(id);
      }

      // All IDs should be unique
      expect(ids.size).toBe(10);
    });

    it('should generate monotonically increasing IDs', async () => {
      const ids: number[] = [];

      for (let i = 0; i < 5; i++) {
        const id = await repository.nextId();
        const num = Number.parseInt(id.replace('knowledge_', ''), 10);
        ids.push(num);
      }

      // Each ID should be greater than the previous
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]!);
      }
    });
  });

  describe('insert and getById', () => {
    it('should insert and retrieve entry', async () => {
      const entry = createTestEntry({ id: 'knowledge_test_insert_1' });
      await repository.insert(entry);

      const retrieved = await repository.getById('knowledge_test_insert_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(entry.id);
      expect(retrieved!.shortcut).toBe(entry.shortcut);
      expect(retrieved!.detail).toBe(entry.detail);
      expect(retrieved!.labels).toEqual(entry.labels);
      expect(retrieved!.lifecycleState).toBe(entry.lifecycleState);
    });

    it('should retrieve entry with all revisions', async () => {
      const now = nowIso();
      const entry = createTestEntry({
        id: 'knowledge_test_revisions_1',
        history: [
          {
            revision: 1,
            submittedAt: now,
            submittedByUserId: 'user_1',
            shortcut: 'First revision',
            detail: 'First detail',
            labels: ['v1'],
            reviewNotes: [],
          },
          {
            revision: 2,
            submittedAt: now,
            submittedByUserId: 'user_1',
            shortcut: 'Second revision',
            detail: 'Second detail',
            labels: ['v2'],
            reviewNotes: [],
          },
        ],
      });

      await repository.insert(entry);
      const retrieved = await repository.getById('knowledge_test_revisions_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.history).toHaveLength(2);
      expect(retrieved!.history[0]!.revision).toBe(1);
      expect(retrieved!.history[1]!.revision).toBe(2);
    });

    it('should retrieve entry with lifecycle events', async () => {
      const entry = createTestEntry({ id: 'knowledge_test_events_1' });
      await repository.insert(entry);

      const retrieved = await repository.getById('knowledge_test_events_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.lifecycleHistory.length).toBeGreaterThan(0);
      expect(retrieved!.lifecycleHistory[0]!.type).toBe('submitted');
    });

    it('should return null for non-existent entry', async () => {
      const retrieved = await repository.getById('knowledge_nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('updateLifecycle', () => {
    it('should update lifecycle state with valid transition', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_lifecycle_1',
        lifecycleState: 'submitted',
      });
      await repository.insert(entry);

      await repository.updateLifecycle('knowledge_test_lifecycle_1', 'agent-pass', {
        actorId: 'user_1',
        note: 'Agent approved',
      });

      const retrieved = await repository.getById('knowledge_test_lifecycle_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.lifecycleState).toBe('agent-pass');
    });

    it('should reject invalid lifecycle transition', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_invalid_1',
        lifecycleState: 'approved',
      });
      await repository.insert(entry);

      await expect(
        repository.updateLifecycle('knowledge_test_invalid_1', 'submitted', {
          actorId: 'user_1',
          note: 'Invalid transition',
        }),
      ).rejects.toThrow(/Invalid lifecycle transition/);
    });

    it('should throw for non-existent entry', async () => {
      await expect(
        repository.updateLifecycle('knowledge_nonexistent', 'agent-pass', {
          actorId: 'user_1',
        }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe('appendRevision', () => {
    it('should append revision to entry', async () => {
      const entry = createTestEntry({ id: 'knowledge_test_append_1' });
      await repository.insert(entry);

      const newRevision: KnowledgeRevisionRecord = {
        revision: 2,
        submittedAt: nowIso(),
        submittedByUserId: 'user_1',
        shortcut: 'Updated shortcut',
        detail: 'Updated detail',
        labels: ['updated'],
        reviewNotes: [],
      };

      await repository.appendRevision('knowledge_test_append_1', newRevision);

      const retrieved = await repository.getById('knowledge_test_append_1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.history).toHaveLength(2);
      expect(retrieved!.latestRevision.revision).toBe(2);
      expect(retrieved!.latestRevision.shortcut).toBe('Updated shortcut');
    });
  });

  describe('listByFilter', () => {
    it('should list by lifecycle state', async () => {
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_list_1',
          lifecycleState: 'approved',
        }),
      );
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_list_2',
          lifecycleState: 'submitted',
        }),
      );
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_list_3',
          lifecycleState: 'approved',
        }),
      );

      const approved = await repository.listByFilter({ lifecycleState: 'approved' });
      expect(approved.length).toBeGreaterThanOrEqual(2);
      expect(approved.every((e) => e.lifecycleState === 'approved')).toBe(true);
    });

    it('should list by team ID', async () => {
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_team_1',
          teamId: 'team_alpha',
        }),
      );
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_team_2',
          teamId: 'team_beta',
        }),
      );

      const teamAlpha = await repository.listByFilter({ teamId: 'team_alpha' });
      expect(teamAlpha.length).toBeGreaterThanOrEqual(1);
      expect(teamAlpha.every((e) => e.teamId === 'team_alpha')).toBe(true);
    });

    it('should list by owner user ID', async () => {
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_owner_1',
          ownerUserId: 'user_alice',
        }),
      );
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_owner_2',
          ownerUserId: 'user_bob',
        }),
      );

      const alices = await repository.listByFilter({ ownerUserId: 'user_alice' });
      expect(alices.length).toBeGreaterThanOrEqual(1);
      expect(alices.every((e) => e.ownerUserId === 'user_alice')).toBe(true);
    });

    it('should return lightweight records without full history', async () => {
      await repository.insert(createTestEntry({ id: 'knowledge_test_light_1' }));

      const entries = await repository.listByFilter({ lifecycleState: 'submitted' });
      const entry = entries.find((e) => e.id === 'knowledge_test_light_1');

      expect(entry).toBeDefined();
      expect(entry!.history).toEqual([]);
      expect(entry!.lifecycleHistory).toEqual([]);
    });
  });

  describe('updateGovernance', () => {
    it('should update labels', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_gov_1',
        labels: ['original'],
      });
      await repository.insert(entry);

      await repository.updateGovernance('knowledge_test_gov_1', { labels: ['updated', 'new'] });

      const retrieved = await repository.getById('knowledge_test_gov_1');
      expect(retrieved!.labels).toEqual(['updated', 'new']);
    });

    it('should update required level', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_gov_2',
        requiredLevel: 0,
      });
      await repository.insert(entry);

      await repository.updateGovernance('knowledge_test_gov_2', { requiredLevel: 5 });

      const retrieved = await repository.getById('knowledge_test_gov_2');
      expect(retrieved!.requiredLevel).toBe(5);
    });
  });

  describe('label filtering (Round 3)', () => {
    it('should filter by single label', async () => {
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_label_1',
          labels: ['postgres', 'migration'],
        }),
      );
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_label_2',
          labels: ['react', 'frontend'],
        }),
      );

      const results = await repository.listByFilter({ labels: ['postgres'] });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((e) => e.labels.includes('postgres'))).toBe(true);
    });

    it('should filter by multiple labels (AND semantics)', async () => {
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_label_and_1',
          labels: ['postgres', 'migration', 'locking'],
        }),
      );
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_label_and_2',
          labels: ['postgres', 'backup'],
        }),
      );

      const results = await repository.listByFilter({ labels: ['postgres', 'migration'] });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((e) => e.labels.includes('postgres') && e.labels.includes('migration'))).toBe(true);
    });

    it('should combine label filter with other filters', async () => {
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_label_combo_1',
          labels: ['postgres'],
          lifecycleState: 'approved',
        }),
      );
      await repository.insert(
        createTestEntry({
          id: 'knowledge_test_label_combo_2',
          labels: ['postgres'],
          lifecycleState: 'submitted',
        }),
      );

      const results = await repository.listByFilter({
        labels: ['postgres'],
        lifecycleState: 'approved',
      });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((e) => e.labels.includes('postgres') && e.lifecycleState === 'approved')).toBe(true);
    });
  });

  describe('boundary sub-tables (Round 3)', () => {
    it('should insert and retrieve entry with boundary', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_boundary_1',
        boundary: createTestBoundary(),
      });
      await repository.insert(entry);

      const retrieved = await repository.getById('knowledge_test_boundary_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.boundary).not.toBeNull();
      expect(retrieved!.boundary!.context).toEqual(['frontend', 'production']);
      expect(retrieved!.boundary!.versions).toHaveLength(1);
      expect(retrieved!.boundary!.versions[0]!.package).toBe('react');
      expect(retrieved!.boundary!.versions[0]!.range).toBe('>=18.0.0');
      expect(retrieved!.boundary!.prerequisites).toHaveLength(1);
      expect(retrieved!.boundary!.prerequisites[0]!.description).toBe('Node.js 18+');
      expect(retrieved!.boundary!.signals).toHaveLength(1);
      expect(retrieved!.boundary!.signals[0]!.pattern).toBe('useEffect');
      expect(retrieved!.boundary!.exclusions).toHaveLength(1);
      expect(retrieved!.boundary!.exclusions[0]!.description).toBe('Not for SSR');
      expect(retrieved!.boundary!.evidence).toHaveLength(1);
      expect(retrieved!.boundary!.evidence[0]!.identifier).toBe('react-docs');
    });

    it('should handle entry with null boundary', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_boundary_null_1',
        boundary: null,
      });
      await repository.insert(entry);

      const retrieved = await repository.getById('knowledge_test_boundary_null_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.boundary).toBeNull();
    });
  });

  describe('maintenance assignments (Round 3)', () => {
    it('should insert and retrieve entry with maintenance meta', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_maint_1',
        maintenanceMeta: createTestMaintenanceMeta(),
      });
      await repository.insert(entry);

      const retrieved = await repository.getById('knowledge_test_maint_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.maintenanceMeta).not.toBeNull();
      expect(retrieved!.maintenanceMeta!.maintainerUserId).toBe('user_maintainer_1');
      expect(retrieved!.maintenanceMeta!.maintainerHandle).toBe('maintainer_alice');
      expect(retrieved!.maintenanceMeta!.maintainerLevel).toBe(5);
      expect(retrieved!.maintenanceMeta!.reviewBy).toBe('2026-12-31T23:59:59.000Z');
    });

    it('should handle entry with null maintenance meta', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_maint_null_1',
        maintenanceMeta: null,
      });
      await repository.insert(entry);

      const retrieved = await repository.getById('knowledge_test_maint_null_1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.maintenanceMeta).toBeNull();
    });
  });

  describe('CHECK constraints (Round 3)', () => {
    it('should reject invalid scope value', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_check_scope_1',
        scope: 'global' as 'global' | 'project',
      });
      // Insert valid entry first
      await repository.insert(entry);

      // Try to update with invalid scope directly via SQL
      await expect(
        testPool.query(
          "UPDATE knowledge_entries SET scope = 'invalid' WHERE id = 'knowledge_test_check_scope_1'",
        ),
      ).rejects.toThrow();
    });

    it('should reject invalid lifecycle_state value', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_check_lifecycle_1',
      });
      await repository.insert(entry);

      await expect(
        testPool.query(
          "UPDATE knowledge_entries SET lifecycle_state = 'invalid_state' WHERE id = 'knowledge_test_check_lifecycle_1'",
        ),
      ).rejects.toThrow();
    });

    it('should reject required_level out of range', async () => {
      const entry = createTestEntry({
        id: 'knowledge_test_check_level_1',
      });
      await repository.insert(entry);

      await expect(
        testPool.query(
          "UPDATE knowledge_entries SET required_level = 11 WHERE id = 'knowledge_test_check_level_1'",
        ),
      ).rejects.toThrow();
    });
  });

  describe('index table compatibility', () => {
    it('should be compatible with existing index tables', async () => {
      // Insert a new entry
      const id = await repository.nextId();
      const entry = createTestEntry({ id });
      await repository.insert(entry);

      // Manually insert into knowledge_embeddings
      await testPool.query(
        `INSERT INTO knowledge_embeddings (id, entry_id, revision, content_hash, vector, scope, required_level, labels)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `entry_${id}_rev1`,
          id,
          1,
          'test_hash',
          '[0.1, 0.2, 0.3]', // Minimal vector for test
          'global',
          0,
          '{}',
        ],
      );

      // Query to verify the embedding is linked
      const result = await testPool.query(
        'SELECT * FROM knowledge_embeddings WHERE entry_id = $1',
        [id],
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.entry_id).toBe(id);

      // Clean up
      await testPool.query('DELETE FROM knowledge_embeddings WHERE entry_id = $1', [id]);
    });
  });
});

// Test concurrent access separately to avoid interference
describeIfDb('PgKnowledgeRepository concurrent access', () => {
  let repository: PgKnowledgeRepository;
  let testPool: Pool;

  beforeAll(async () => {
    testPool = (await getPool()) as Pool;
    repository = new PgKnowledgeRepository(testPool);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    await testPool.query("DELETE FROM knowledge_entries WHERE id LIKE 'knowledge_concurrent_%'");
    await testPool.query(
      "DELETE FROM knowledge_revisions WHERE entry_id LIKE 'knowledge_concurrent_%'",
    );
    await testPool.query(
      "DELETE FROM lifecycle_events WHERE entry_id LIKE 'knowledge_concurrent_%'",
    );
  });

  it('should handle concurrent lifecycle updates safely', async () => {
    const entry = createTestEntry({
      id: 'knowledge_concurrent_1',
      lifecycleState: 'agent-pass',
    });
    await repository.insert(entry);

    // Two concurrent updates to different states from agent-pass
    // Both are valid transitions: agent-pass -> approved, agent-pass -> rejected
    const update1 = repository.updateLifecycle('knowledge_concurrent_1', 'approved', {
      actorId: 'user_1',
    });
    const update2 = repository.updateLifecycle('knowledge_concurrent_1', 'rejected', {
      actorId: 'user_2',
    });

    // Both should complete without error (one may race the other)
    const results = await Promise.allSettled([update1, update2]);

    // At least one should succeed
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    // Final state should be one of the two
    const retrieved = await repository.getById('knowledge_concurrent_1');
    expect(['approved', 'rejected']).toContain(retrieved!.lifecycleState);
  });
});
