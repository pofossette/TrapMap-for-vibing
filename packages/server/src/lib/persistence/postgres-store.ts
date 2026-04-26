import type { Pool } from 'pg';

import type { SkillShareerStore, StoreData } from '../store.js';
import { createEmptyStoreData } from '../store.js';

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
  private initialized = false;

  constructor(private readonly pool: Pool) {}

  async snapshot(): Promise<StoreData> {
    await this.ensureSchema();
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
    await this.ensureSchema();

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
    await this.pool.end();
  }

  /**
   * Lazily create the store_snapshot table if it does not exist.
   * This avoids requiring a separate manual bootstrap step just to start
   * the server.
   */
  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS store_snapshot (
        key TEXT PRIMARY KEY DEFAULT 'main',
        data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    this.initialized = true;
  }
}
