import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { afterEach, describe, expect, it } from 'vitest';

import { createSkillShareerStore } from './persistence/create-store.js';
import { PostgresStore } from './persistence/postgres-store.js';
import type { SkillShareerStore } from './store.js';
import { JsonStore, nowIso } from './store.js';

function createPostgresStore(): PostgresStore {
  const db = newDb();
  db.registerExtension('vector', () => {});
  const { Pool } = db.adapters.createPg();
  return new PostgresStore(new Pool() as unknown as Pool);
}

/**
 * Helper to run store contract tests against any SkillShareerStore implementation.
 * This ensures both JsonStore and PostgresStore satisfy the same behavioral contract.
 */
function runSharedStoreContractTests(
  name: string,
  createStore: () => SkillShareerStore & { close?: () => Promise<void> },
) {
  describe(`${name} - shared store contract`, () => {
    let store: SkillShareerStore & { close?: () => Promise<void> };

    afterEach(async () => {
      if (store?.close) {
        await store.close();
      }
    });

    it('initializes an empty StoreData snapshot on first read', async () => {
      store = createStore();

      const snapshot = await store.snapshot();

      expect(snapshot.counters).toEqual({});
      expect(snapshot.users).toEqual([]);
      expect(snapshot.knowledgeEntries).toEqual([]);
      expect(snapshot.graphIndexDocuments).toEqual([]);
    });

    it('persists aggregate mutations and nextId allocations inside transact', async () => {
      store = createStore();
      const createdAt = nowIso();

      const userId = await store.transact((data) => {
        const nextUserId = store.nextId(data, 'user');
        data.users.push({
          id: nextUserId,
          handle: 'alice',
          notes: null,
          createdAt,
          updatedAt: createdAt,
        });
        return nextUserId;
      });

      expect(userId).toBe('user_1');

      const snapshot = await store.snapshot();
      expect(snapshot.counters.user).toBe(1);
      expect(snapshot.users).toHaveLength(1);
      expect(snapshot.users[0]).toMatchObject({
        id: 'user_1',
        handle: 'alice',
      });
    });

    it('round-trips snapshot through transact with multiple writes', async () => {
      store = createStore();
      const createdAt = nowIso();

      // First write: create a user
      await store.transact((data) => {
        const userId = store.nextId(data, 'user');
        data.users.push({
          id: userId,
          handle: 'bob',
          notes: null,
          createdAt,
          updatedAt: createdAt,
        });
      });

      // Second write: create a team
      await store.transact((data) => {
        const teamId = store.nextId(data, 'team');
        data.teams.push({
          id: teamId,
          name: 'Engineering',
          slug: 'engineering',
          description: null,
          createdAt,
          updatedAt: createdAt,
        });
      });

      // Verify both persisted
      const snapshot = await store.snapshot();
      expect(snapshot.users).toHaveLength(1);
      expect(snapshot.teams).toHaveLength(1);
      expect(snapshot.counters.user).toBe(1);
      expect(snapshot.counters.team).toBe(1);
    });

    it('advances nextId correctly across multiple transactions', async () => {
      store = createStore();
      const createdAt = nowIso();

      // Create multiple users in separate transactions
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const id = await store.transact((data) => {
          const userId = store.nextId(data, 'user');
          data.users.push({
            id: userId,
            handle: `user${i}`,
            notes: null,
            createdAt,
            updatedAt: createdAt,
          });
          return userId;
        });
        ids.push(id);
      }

      expect(ids).toEqual(['user_1', 'user_2', 'user_3']);

      const snapshot = await store.snapshot();
      expect(snapshot.counters.user).toBe(3);
      expect(snapshot.users).toHaveLength(3);
    });

    it('creates multiple entities in a single transaction with correct ID allocation', async () => {
      store = createStore();
      const createdAt = nowIso();

      // Create user, team, and membership in one transaction
      const result = await store.transact((data) => {
        const userId = store.nextId(data, 'user');
        const teamId = store.nextId(data, 'team');
        const membershipId = store.nextId(data, 'membership');

        data.users.push({
          id: userId,
          handle: 'charlie',
          notes: null,
          createdAt,
          updatedAt: createdAt,
        });

        data.teams.push({
          id: teamId,
          name: 'Product',
          slug: 'product',
          description: null,
          createdAt,
          updatedAt: createdAt,
        });

        data.memberships.push({
          id: membershipId,
          userId,
          teamId,
          roleTemplate: 'member',
          securityLevel: 5,
          permissions: [],
          notes: null,
          createdAt,
          updatedAt: createdAt,
        });

        return { userId, teamId, membershipId };
      });

      expect(result.userId).toBe('user_1');
      expect(result.teamId).toBe('team_1');
      expect(result.membershipId).toBe('membership_1');

      const snapshot = await store.snapshot();
      expect(snapshot.users).toHaveLength(1);
      expect(snapshot.teams).toHaveLength(1);
      expect(snapshot.memberships).toHaveLength(1);
    });

    it('returns independent counters for different prefixes', async () => {
      store = createStore();

      const ids = await store.transact((data) => {
        return {
          user1: store.nextId(data, 'user'),
          user2: store.nextId(data, 'user'),
          team1: store.nextId(data, 'team'),
          knowledge1: store.nextId(data, 'knowledge'),
          user3: store.nextId(data, 'user'),
        };
      });

      expect(ids.user1).toBe('user_1');
      expect(ids.user2).toBe('user_2');
      expect(ids.team1).toBe('team_1');
      expect(ids.knowledge1).toBe('knowledge_1');
      expect(ids.user3).toBe('user_3');
    });
  });
}

// Run shared contract tests against both store implementations
runSharedStoreContractTests('PostgresStore', () => createPostgresStore());

runSharedStoreContractTests('JsonStore', () => {
  const tmpFile = `/tmp/trapmap-jsonstore-contract-test-${Date.now()}-${Math.random()}.json`;
  return new JsonStore(tmpFile);
});

describe('createSkillShareerStore', () => {
  const storesToClose: PostgresStore[] = [];

  afterEach(async () => {
    await Promise.all(storesToClose.splice(0).map((store) => store.close()));
  });

  it('returns JsonStore when no database URL is configured', () => {
    const store = createSkillShareerStore({
      dataFile: '/tmp/trapmap-store-test.json',
      databaseUrl: null,
    });

    expect(store).toBeInstanceOf(JsonStore);
  });

  it('returns PostgresStore when a database URL is configured', () => {
    const store = createSkillShareerStore({
      dataFile: '/tmp/trapmap-store-test.json',
      databaseUrl: 'postgres://trapmap:trapmap@127.0.0.1:5432/trapmap',
    });

    expect(store).toBeInstanceOf(PostgresStore);

    if (store instanceof PostgresStore) {
      storesToClose.push(store);
    }
  });

  it('both store selections return a valid SkillShareerStore', async () => {
    // Verify the JsonStore selection satisfies the contract
    const jsonStore = createSkillShareerStore({
      dataFile: `/tmp/trapmap-store-selection-json-${Date.now()}.json`,
      databaseUrl: null,
    });
    const jsonSnapshot = await jsonStore.snapshot();
    expect(jsonSnapshot.counters).toEqual({});

    // Verify the PostgresStore selection using pg-mem (not a real DB connection)
    const pgStore = createPostgresStore();
    const pgSnapshot = await pgStore.snapshot();
    expect(pgSnapshot.counters).toEqual({});

    await pgStore.close();
  });
});

describe('store assignability at route level', () => {
  it('both JsonStore and PostgresStore are assignable to SkillShareerStore and support full operations', async () => {
    // This test verifies that both store implementations can be used
    // wherever SkillShareerStore is expected (e.g., app.skillShareer.store)
    type AppStore = SkillShareerStore;

    // Use direct instantiation (pg-mem for PostgresStore, temp file for JsonStore)
    // rather than createSkillShareerStore which would try to connect to real PostgreSQL
    const jsonStore: AppStore = new JsonStore(`/tmp/trapmap-assign-test-json-${Date.now()}.json`);
    const pgStore: AppStore = createPostgresStore();

    // Both stores must support the SkillShareerStore operations
    const jsonResult = await jsonStore.transact((data) => {
      const id = jsonStore.nextId(data, 'user');
      data.users.push({
        id,
        handle: 'assignability-test',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      return id;
    });
    expect(jsonResult).toBe('user_1');

    const pgResult = await pgStore.transact((data) => {
      const id = pgStore.nextId(data, 'user');
      data.users.push({
        id,
        handle: 'assignability-test',
        notes: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      return id;
    });
    expect(pgResult).toBe('user_1');

    // Cleanup
    if ('close' in pgStore && typeof pgStore.close === 'function') {
      await pgStore.close();
    }
  });

  it('both stores produce structurally equivalent snapshots', async () => {
    const jsonStore: SkillShareerStore = new JsonStore(
      `/tmp/trapmap-equiv-test-json-${Date.now()}.json`,
    );
    const pgStore: SkillShareerStore = createPostgresStore();

    const jsonSnapshot = await jsonStore.snapshot();
    const pgSnapshot = await pgStore.snapshot();

    // Both empty snapshots should have the same structural keys
    expect(Object.keys(jsonSnapshot).sort()).toEqual(Object.keys(pgSnapshot).sort());

    // Both should have empty arrays for collection fields
    expect(jsonSnapshot.users).toEqual([]);
    expect(pgSnapshot.users).toEqual([]);
    expect(jsonSnapshot.teams).toEqual([]);
    expect(pgSnapshot.teams).toEqual([]);
    expect(jsonSnapshot.knowledgeEntries).toEqual([]);
    expect(pgSnapshot.knowledgeEntries).toEqual([]);
    expect(jsonSnapshot.skillArtifacts).toEqual([]);
    expect(pgSnapshot.skillArtifacts).toEqual([]);
    expect(jsonSnapshot.graphIndexDocuments).toEqual([]);
    expect(pgSnapshot.graphIndexDocuments).toEqual([]);

    // Cleanup
    if ('close' in pgStore && typeof pgStore.close === 'function') {
      await pgStore.close();
    }
  });

  it('runtime selection through createSkillShareerStore assigns correct concrete type', () => {
    // Factory selection test (instanceof checks only, no actual DB connection needed)
    const jsonStore = createSkillShareerStore({
      dataFile: '/tmp/trapmap-runtime-selection-test.json',
      databaseUrl: null,
    });

    // JsonStore should be directly usable as SkillShareerStore
    const _assignabilityCheck: SkillShareerStore = jsonStore;
    expect(_assignabilityCheck).toBeInstanceOf(JsonStore);

    // PostgresStore returned from factory (with real URL) is also SkillShareerStore
    // We test type assignability without calling methods that require a live connection
    const pgStoreFromFactory = createSkillShareerStore({
      dataFile: '/tmp/trapmap-runtime-selection-test.json',
      databaseUrl: 'postgres://trapmap:trapmap@127.0.0.1:5432/trapmap',
    });
    const _pgAssignabilityCheck: SkillShareerStore = pgStoreFromFactory;
    expect(_pgAssignabilityCheck).toBeInstanceOf(PostgresStore);

    // Cleanup (pool was created but never connected)
    if (pgStoreFromFactory instanceof PostgresStore) {
      pgStoreFromFactory.close().catch(() => {});
    }
  });
});
