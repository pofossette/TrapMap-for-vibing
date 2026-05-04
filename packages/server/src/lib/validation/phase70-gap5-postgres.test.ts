/**
 * Phase 70 Nyquist Gap Validation - Gap 5: Postgres store CRUD.
 *
 * Tests that PostgresStore correctly handles CRUD operations with proper
 * error handling: snapshot, transact, nextId, close, and edge cases.
 */

import { describe, expect, it, vi } from 'vitest';

import type { StoreData } from '../store.js';
import { createEmptyStoreData } from '../store.js';
import { PostgresStore } from '../persistence/postgres-store.js';

function makeMockPool(initialData?: StoreData) {
  const storeSnapshot = new Map<string, StoreData>();
  if (initialData) {
    storeSnapshot.set('main', initialData);
  }

  const handleQuery = async (sql: string, params?: unknown[]) => {
    const sqlUpper = sql.toUpperCase().trim();
    if (sqlUpper.startsWith('CREATE')) return { rows: [] };
    if (sqlUpper.includes('SELECT') && sqlUpper.includes('STORE_SNAPSHOT')) {
      const key = params?.[0] ?? 'main';
      const data = storeSnapshot.get(key as string);
      if (!data) return { rows: [] };
      return { rows: [{ data }] };
    }
    if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('STORE_SNAPSHOT')) {
      const jsonStr = params?.[0] as string;
      const data = JSON.parse(jsonStr) as StoreData;
      storeSnapshot.set('main', data);
      return { rows: [] };
    }
    return { rows: [] };
  };

  const client = {
    query: vi.fn().mockImplementation(handleQuery),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn(handleQuery),
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
    _client: client,
    _storeSnapshot: storeSnapshot,
  };

  return pool;
}

describe('Gap 5: Postgres store CRUD operations with proper error handling', () => {
  it('snapshot returns empty data when database row does not exist', async () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    const result = await store.snapshot();

    expect(result).toEqual(createEmptyStoreData());
  });

  it('snapshot returns stored data after transact writes', async () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    await store.transact((data) => {
      data.counters['test'] = 42;
      return 'ok';
    });

    const result = await store.snapshot();
    expect(result.counters['test']).toBe(42);
  });

  it('transact rolls back and re-throws on mutator error', async () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    await expect(
      store.transact(() => {
        throw new Error('mutation exploded');
      }),
    ).rejects.toThrow('mutation exploded');

    const clientCalls = pool._client.query.mock.calls.map(
      (c: unknown[]) => (c[0] as string).toUpperCase().trim(),
    );
    expect(clientCalls).toContain('ROLLBACK');
  });

  it('transact releases client even when mutator throws', async () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    await expect(
      store.transact(() => {
        throw new Error('fail');
      }),
    ).rejects.toThrow();

    expect(pool._client.release).toHaveBeenCalledTimes(1);
  });

  it('nextId generates sequential IDs per prefix independently', () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);
    const data = createEmptyStoreData();

    const id1 = store.nextId(data, 'knowledge');
    const id2 = store.nextId(data, 'knowledge');
    const id3 = store.nextId(data, 'skill');
    const id4 = store.nextId(data, 'knowledge');

    expect(id1).toBe('knowledge_1');
    expect(id2).toBe('knowledge_2');
    expect(id3).toBe('skill_1');
    expect(id4).toBe('knowledge_3');
    expect(data.counters['knowledge']).toBe(3);
    expect(data.counters['skill']).toBe(1);
  });

  it('transact returns mutator return value correctly', async () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    const result = await store.transact(() => ({ count: 99, status: 'done' }));

    expect(result).toEqual({ count: 99, status: 'done' });
  });

  it('close calls pool.end exactly once', async () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    await store.close();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('getPool returns the original pool instance', () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    expect(store.getPool()).toBe(pool);
  });

  it('snapshot handles null data row by returning empty store data', async () => {
    const pool = makeMockPool();
    pool.query.mockImplementation(async (sql: string) => {
      const sqlUpper = sql.toUpperCase().trim();
      if (sqlUpper.includes('CREATE')) return { rows: [] };
      if (sqlUpper.includes('SELECT') && sqlUpper.includes('STORE_SNAPSHOT')) {
        return { rows: [{ data: null }] };
      }
      return { rows: [] };
    });

    const store = new PostgresStore(pool as never);
    const result = await store.snapshot();

    expect(result).toEqual(createEmptyStoreData());
  });

  it('transact executes BEGIN and COMMIT for successful operations', async () => {
    const pool = makeMockPool();
    const store = new PostgresStore(pool as never);

    await store.transact(() => 'ok');

    const clientCalls = pool._client.query.mock.calls.map(
      (c: unknown[]) => (c[0] as string).toUpperCase().trim(),
    );
    expect(clientCalls).toContain('BEGIN');
    expect(clientCalls).toContain('COMMIT');
  });

  it('transact with existing data provides that data to mutator', async () => {
    const existingData = createEmptyStoreData();
    existingData.counters = { knowledge: 10 };

    const pool = makeMockPool(existingData);
    const store = new PostgresStore(pool as never);

    await store.transact((data) => {
      expect(data.counters['knowledge']).toBe(10);
      return 'verified';
    });
  });
});
