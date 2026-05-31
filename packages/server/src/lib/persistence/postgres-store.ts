import type { Pool } from 'pg';

import type { SkillShareerStore, StoreData } from '@trapmap/server/lib/store.js';
import { createEmptyStoreData } from '@trapmap/server/lib/store.js';

/**
 * PostgreSQL-backed compatibility store.
 *
 * Persists one canonical StoreData snapshot row in JSONB.
 * Preserves the snapshot/transact/nextId contract so domain logic
 * does not need a repository rewrite.
 *
 * Uses row-level locking in transact to keep writes serialized from
 * the caller's point of view, matching JsonStore's write-chain semantics.
 *
 * The Drizzle schema definition in schema.ts describes the table structure
 * for future relational decomposition and migration tooling.
 */
export class PostgresStore implements SkillShareerStore {
  private closed = false;

  constructor(protected readonly pool: Pool) {}

  /**
   * Get the underlying PostgreSQL pool for advanced operations.
   * Used by task queue and other services that need direct pool access.
   */
  getPool(): Pool {
    return this.pool;
  }

  async snapshot(): Promise<StoreData> {
    const { rows } = await this.pool.query<{ data: StoreData | null }>(
      'SELECT data FROM store_snapshot WHERE key = $1',
      ['main'],
    );

    if (rows.length === 0) {
      return createEmptyStoreData();
    }

    return rows[0]!.data ?? createEmptyStoreData();
  }

  async transact<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T> {
    // Use a database transaction with row-level locking to serialize writes
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the snapshot row for update (or get empty if no row exists)
      const { rows } = await client.query<{ data: StoreData | null }>(
        'SELECT data FROM store_snapshot WHERE key = $1 FOR UPDATE',
        ['main'],
      );

      const rawData = rows.length > 0 ? rows[0]!.data : null;
      const data: StoreData = rawData ?? createEmptyStoreData();

      const result = await mutator(data);

      const jsonStr = JSON.stringify(data);
      await client.query(
        `INSERT INTO store_snapshot (key, data, updated_at)
         VALUES ('main', $1::jsonb, NOW())
         ON CONFLICT (key)
         DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
        [jsonStr],
      );

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  nextId(data: StoreData, prefix: string): string {
    const nextValue = (data.counters[prefix] ?? 0) + 1;
    data.counters[prefix] = nextValue;
    return `${prefix}_${nextValue}`;
  }

  /**
   * Close the underlying pool. Call during shutdown or test cleanup.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.pool.end();
  }
}
