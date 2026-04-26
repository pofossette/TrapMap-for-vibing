import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { afterEach, describe, expect, it } from 'vitest';

import { createSkillShareerStore } from './persistence/create-store.js';
import { PostgresStore } from './persistence/postgres-store.js';
import { JsonStore, nowIso } from './store.js';

function createPostgresStore(): PostgresStore {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new PostgresStore(new Pool() as unknown as Pool);
}

describe('PostgresStore', () => {
  let store: PostgresStore | null = null;

  afterEach(async () => {
    if (store) {
      await store.close();
      store = null;
    }
  });

  it('initializes an empty StoreData snapshot on first read', async () => {
    store = createPostgresStore();

    const snapshot = await store.snapshot();

    expect(snapshot.counters).toEqual({});
    expect(snapshot.users).toEqual([]);
    expect(snapshot.knowledgeEntries).toEqual([]);
    expect(snapshot.graphIndexDocuments).toEqual([]);
  });

  it('persists aggregate mutations and nextId allocations inside transact', async () => {
    store = createPostgresStore();
    const createdAt = nowIso();

    const userId = await store.transact((data) => {
      const nextUserId = store!.nextId(data, 'user');
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
});
