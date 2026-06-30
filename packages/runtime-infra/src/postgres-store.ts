import type { Pool } from 'pg';

import { recordDatabaseMetric } from './metrics.js';

import { type SkillShareerStore, type StoreData, createEmptyStoreData } from './store.js';

export class PostgresStore implements SkillShareerStore {
  private closed = false;

  constructor(protected readonly pool: Pool) {}

  getPool(): Pool {
    return this.pool;
  }

  async snapshot(): Promise<StoreData> {
    const startedAt = Date.now();
    try {
      const { rows } = await this.pool.query<{ data: StoreData | null }>(
        'SELECT data FROM store_snapshot WHERE key = $1',
        ['main'],
      );

      recordDatabaseMetric({
        serviceName: 'server-compatibility-seam',
        operation: 'store_snapshot.select',
        latencyMs: Date.now() - startedAt,
        success: true,
      });

      if (rows.length === 0) {
        return createEmptyStoreData();
      }

      return rows[0]!.data ?? createEmptyStoreData();
    } catch (error) {
      recordDatabaseMetric({
        serviceName: 'server-compatibility-seam',
        operation: 'store_snapshot.select',
        latencyMs: Date.now() - startedAt,
        success: false,
      });
      throw error;
    }
  }

  async transact<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T> {
    return this.transactWithPgClient((data) => mutator(data));
  }

  async transactWithPgClient<T>(
    mutator: (data: StoreData, client: import('pg').PoolClient) => Promise<T> | T,
  ): Promise<T> {
    const startedAt = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ data: StoreData | null }>(
        'SELECT data FROM store_snapshot WHERE key = $1 FOR UPDATE',
        ['main'],
      );

      const rawData = rows.length > 0 ? rows[0]!.data : null;
      const data: StoreData = rawData ?? createEmptyStoreData();

      const result = await mutator(data, client);

      const jsonStr = JSON.stringify(data);
      await client.query(
        `INSERT INTO store_snapshot (key, data, updated_at)
         VALUES ('main', $1::jsonb, NOW())
         ON CONFLICT (key)
         DO UPDATE SET data = $1::jsonb, updated_at = NOW()`,
        [jsonStr],
      );

      await client.query('COMMIT');
      recordDatabaseMetric({
        serviceName: 'server-compatibility-seam',
        operation: 'store_snapshot.transact',
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      recordDatabaseMetric({
        serviceName: 'server-compatibility-seam',
        operation: 'store_snapshot.transact',
        latencyMs: Date.now() - startedAt,
        success: false,
      });
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

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.pool.end();
  }
}
