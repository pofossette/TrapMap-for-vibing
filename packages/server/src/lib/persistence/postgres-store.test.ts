/**
 * Unit tests for PostgresStore.
 *
 * Tests cover:
 * - snapshot() returns empty store data when no row exists
 * - snapshot() returns parsed data from store_snapshot row
 * - snapshot() handles null data field gracefully
 * - snapshot() does not issue runtime DDL
 * - transact() success path (begin, lock, mutate, upsert, commit)
 * - transact() rolls back on error
 * - transact() handles rollback failure gracefully
 * - transact() inserts new row if not exists (upsert behavior)
 * - nextId() increments counter for prefix
 * - nextId() returns formatted ID string
 * - nextId() maintains separate counters per prefix
 * - close() calls pool.end()
 * - getPool() returns the pool instance
 *
 * Phase: 70 (TEST-03)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoreData } from '@trapmap/server/lib/store.js';
import { createEmptyStoreData } from '@trapmap/server/lib/store.js';
import { PostgresStore } from './postgres-store.js';

// ---------------------------------------------------------------------------
// Mock pool helper
// ---------------------------------------------------------------------------

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function createMockClient(): MockClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
}

interface MockPool {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  _client: MockClient;
  _storeSnapshot: Map<string, StoreData>;
}

function createMockPool(initialData?: StoreData): MockPool {
  const storeSnapshot = new Map<string, StoreData>();
  if (initialData) {
    storeSnapshot.set('main', initialData);
  }

  const handleQuery = async (sql: string, params?: unknown[]) => {
    const sqlUpper = sql.toUpperCase().trim();

    // SELECT data FROM store_snapshot
    if (sqlUpper.includes('SELECT') && sqlUpper.includes('STORE_SNAPSHOT')) {
      const key = params?.[0] ?? 'main';
      const data = storeSnapshot.get(key as string);
      if (!data) {
        return { rows: [] };
      }
      return { rows: [{ data }] };
    }

    // INSERT INTO store_snapshot (upsert)
    if (sqlUpper.includes('INSERT INTO') && sqlUpper.includes('STORE_SNAPSHOT')) {
      const jsonStr = params?.[0] as string;
      const data = JSON.parse(jsonStr) as StoreData;
      storeSnapshot.set('main', data);
      return { rows: [] };
    }

    return { rows: [] };
  };

  const client = createMockClient();
  client.query.mockImplementation(handleQuery);

  const pool: MockPool = {
    query: vi.fn(handleQuery),
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
    _client: client,
    _storeSnapshot: storeSnapshot,
  };

  return pool;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PostgresStore', () => {
  describe('getPool', () => {
    it('returns the underlying pool instance', () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      expect(store.getPool()).toBe(pool);
    });
  });

  describe('close', () => {
    it('calls pool.end()', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      await store.close();

      expect(pool.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('snapshot', () => {
    it('returns createEmptyStoreData when no row exists', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      const result = await store.snapshot();

      expect(result).toEqual(createEmptyStoreData());
    });

    it('returns parsed data from store_snapshot row', async () => {
      const existingData = createEmptyStoreData();
      existingData.counters = { knowledge: 5 };
      existingData.users = [
        {
          id: 'user_1',
          handle: 'alice',
          notes: null,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const pool = createMockPool(existingData);
      const store = new PostgresStore(pool as never);

      const result = await store.snapshot();

      expect(result.counters).toEqual({ knowledge: 5 });
      expect(result.users).toHaveLength(1);
      expect(result.users[0]!.id).toBe('user_1');
    });

    it('handles null data field gracefully (returns empty store)', async () => {
      // Simulate a row with null data
      const pool = createMockPool();
      // Override the pool query to return a row with null data
      pool.query.mockImplementation(async (sql: string) => {
        const sqlUpper = sql.toUpperCase().trim();
        if (sqlUpper.includes('SELECT') && sqlUpper.includes('STORE_SNAPSHOT')) {
          return { rows: [{ data: null }] };
        }
        return { rows: [] };
      });

      const store = new PostgresStore(pool as never);
      const result = await store.snapshot();

      expect(result).toEqual(createEmptyStoreData());
    });

    it('does not issue runtime DDL before reading', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      await store.snapshot();

      const poolCalls = pool.query.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(
        poolCalls.some((sql) => sql.toUpperCase().includes('CREATE TABLE IF NOT EXISTS')),
      ).toBe(false);
    });
  });

  describe('transact', () => {
    it('begins transaction, locks row, calls mutator, and commits', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      let _mutatorData: StoreData | null = null;
      const result = await store.transact(async (data) => {
        _mutatorData = data;
        return 'test-result';
      });

      expect(result).toBe('test-result');

      // Verify client was used
      const client = pool._client;
      expect(pool.connect).toHaveBeenCalled();

      // Check BEGIN, SELECT FOR UPDATE, INSERT upsert, COMMIT
      const clientCalls = client.query.mock.calls.map((c: unknown[]) =>
        (c[0] as string).toUpperCase().trim(),
      );
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls.some((s: string) => s.includes('FOR UPDATE'))).toBe(true);
      expect(
        clientCalls.some((s: string) => s.includes('INSERT INTO') && s.includes('STORE_SNAPSHOT')),
      ).toBe(true);
      expect(clientCalls).toContain('COMMIT');
    });

    it('returns mutator result', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      const result = await store.transact((data) => {
        data.counters.test = 42;
        return { value: 'hello' };
      });

      expect(result).toEqual({ value: 'hello' });
    });

    it('provides empty store data when no row exists', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      await store.transact((data) => {
        expect(data).toEqual(createEmptyStoreData());
      });
    });

    it('provides existing data from the store', async () => {
      const existingData = createEmptyStoreData();
      existingData.counters = { knowledge: 10 };

      const pool = createMockPool(existingData);
      const store = new PostgresStore(pool as never);

      await store.transact((data) => {
        expect(data.counters.knowledge).toBe(10);
      });
    });

    it('rolls back on error and re-throws', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      const error = new Error('mutation failed');

      await expect(
        store.transact(() => {
          throw error;
        }),
      ).rejects.toThrow('mutation failed');

      const clientCalls = pool._client.query.mock.calls.map((c: unknown[]) =>
        (c[0] as string).toUpperCase().trim(),
      );
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('ROLLBACK');
    });

    it('handles rollback failure gracefully', async () => {
      const pool = createMockPool();
      const client = pool._client;
      const store = new PostgresStore(pool as never);

      // Make ROLLBACK fail
      const originalImpl = client.query.getMockImplementation();
      client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql === 'ROLLBACK') {
          throw new Error('rollback failed');
        }
        if (originalImpl) return originalImpl(sql, params);
        return { rows: [] };
      });

      await expect(
        store.transact(() => {
          throw new Error('mutation failed');
        }),
      ).rejects.toThrow('mutation failed');

      // Should not throw from the failed rollback
    });

    it('releases client in finally block on success', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      await store.transact(() => 'ok');

      expect(pool._client.release).toHaveBeenCalledTimes(1);
    });

    it('releases client in finally block on error', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      await expect(
        store.transact(() => {
          throw new Error('fail');
        }),
      ).rejects.toThrow();

      expect(pool._client.release).toHaveBeenCalledTimes(1);
    });

    it('supports async mutators', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      const result = await store.transact(async (data) => {
        await new Promise((r) => setTimeout(r, 1));
        data.counters.async = 1;
        return 'async-result';
      });

      expect(result).toBe('async-result');
    });

    it('does not issue runtime DDL before transaction work', async () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);

      await store.transact(() => 'ok');

      const poolCalls = pool.query.mock.calls.map((c: unknown[]) => c[0] as string);
      const clientCalls = pool._client.query.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(
        [...poolCalls, ...clientCalls].some((sql) =>
          sql.toUpperCase().includes('CREATE TABLE IF NOT EXISTS'),
        ),
      ).toBe(false);
    });
  });

  describe('nextId', () => {
    it('increments counter for prefix', () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);
      const data = createEmptyStoreData();

      store.nextId(data, 'knowledge');

      expect(data.counters.knowledge).toBe(1);
    });

    it('returns formatted ID string', () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);
      const data = createEmptyStoreData();

      const id = store.nextId(data, 'knowledge');

      expect(id).toBe('knowledge_1');
    });

    it('increments on each call', () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);
      const data = createEmptyStoreData();

      const id1 = store.nextId(data, 'knowledge');
      const id2 = store.nextId(data, 'knowledge');
      const id3 = store.nextId(data, 'knowledge');

      expect(id1).toBe('knowledge_1');
      expect(id2).toBe('knowledge_2');
      expect(id3).toBe('knowledge_3');
      expect(data.counters.knowledge).toBe(3);
    });

    it('maintains separate counters per prefix', () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);
      const data = createEmptyStoreData();

      store.nextId(data, 'knowledge');
      store.nextId(data, 'knowledge');
      const skillId = store.nextId(data, 'skill');
      store.nextId(data, 'skill');
      store.nextId(data, 'skill');
      const teamId = store.nextId(data, 'team');

      expect(data.counters.knowledge).toBe(2);
      expect(data.counters.skill).toBe(3);
      expect(data.counters.team).toBe(1);
      expect(skillId).toBe('skill_1');
      expect(teamId).toBe('team_1');
    });

    it('starts from 0 when prefix not yet used', () => {
      const pool = createMockPool();
      const store = new PostgresStore(pool as never);
      const data = createEmptyStoreData();
      data.counters = { existing: 5 };

      const id = store.nextId(data, 'new_prefix');

      expect(id).toBe('new_prefix_1');
      expect(data.counters.new_prefix).toBe(1);
      // existing counter untouched
      expect(data.counters.existing).toBe(5);
    });
  });
});
