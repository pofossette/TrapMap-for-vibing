import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { afterEach, describe, expect, it } from 'vitest';

import { createSkillShareerStore } from './persistence/create-store.js';
import { PostgresStore } from './persistence/postgres-store.js';
import type { SkillShareerStore } from './store.js';
import { JsonStore, nowIso } from './store.js';

function createPostgresStore(): PostgresStore {
  const db = newDb();
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

// Run shared contract tests against PostgresStore
runSharedStoreContractTests('PostgresStore', () => createPostgresStore());

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
});
