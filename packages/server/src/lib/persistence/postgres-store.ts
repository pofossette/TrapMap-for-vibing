import { Pool as NodePgPool } from 'pg';
import type { Pool, PoolClient } from 'pg';

import {
  createEmptyStoreData,
  cloneStoreData,
  nowIso,
  type SkillShareerStore,
  type StoreData,
} from '../store.js';

const DEFAULT_SNAPSHOT_KEY = 'primary';

export interface PostgresStoreOptions {
  databaseUrl?: string;
  pool?: Pool;
  snapshotKey?: string;
}

export class PostgresStore implements SkillShareerStore {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;
  private readonly snapshotKey: string;
  private initializationPromise: Promise<void> | null = null;

  constructor(options: PostgresStoreOptions = {}) {
    if (options.pool) {
      this.pool = options.pool;
      this.ownsPool = false;
    } else if (options.databaseUrl) {
      this.pool = new NodePgPool({
        connectionString: options.databaseUrl,
      });
      this.ownsPool = true;
    } else {
      throw new Error('PostgresStore requires either a databaseUrl or a pool');
    }

    this.snapshotKey = options.snapshotKey ?? DEFAULT_SNAPSHOT_KEY;
  }

  async snapshot(): Promise<StoreData> {
    await this.ensureInitialized();

    return this.withClient(async (client) => this.loadSnapshot(client));
  }

  async transact<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T> {
    await this.ensureInitialized();

    return this.withClient(async (client) => {
      await client.query('BEGIN');

      try {
        const data = await this.loadLockedSnapshot(client);
        const result = await mutator(data);
        await this.persistSnapshot(client, data);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  nextId(data: StoreData, prefix: string): string {
    const nextValue = (data.counters[prefix] ?? 0) + 1;
    data.counters[prefix] = nextValue;
    return `${prefix}_${nextValue}`;
  }

  async close(): Promise<void> {
    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.withClient(async (client) => {
        await client.query(`
          create table if not exists store_snapshots (
            key text primary key,
            state jsonb not null,
            created_at text not null,
            updated_at text not null
          )
        `);

        const existing = await client.query<{ key: string }>(
          'select key from store_snapshots where key = $1 limit 1',
          [this.snapshotKey],
        );

        if (existing.rowCount === 0) {
          const now = nowIso();
          await client.query(
            `
              insert into store_snapshots (key, state, created_at, updated_at)
              values ($1, $2::jsonb, $3, $4)
            `,
            [this.snapshotKey, JSON.stringify(createEmptyStoreData()), now, now],
          );
        }
      });
    }

    try {
      await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private async loadSnapshot(client: PoolClient): Promise<StoreData> {
    const result = await client.query<{ state: unknown }>(
      'select state from store_snapshots where key = $1 limit 1',
      [this.snapshotKey],
    );

    return this.decodeSnapshotState(result.rows[0]?.state);
  }

  private async loadLockedSnapshot(client: PoolClient): Promise<StoreData> {
    const result = await client.query<{ state: unknown }>(
      'select state from store_snapshots where key = $1 for update',
      [this.snapshotKey],
    );

    return this.decodeSnapshotState(result.rows[0]?.state);
  }

  private async persistSnapshot(client: PoolClient, data: StoreData): Promise<void> {
    await client.query(
      `
        update store_snapshots
        set state = $2::jsonb,
            updated_at = $3
        where key = $1
      `,
      [this.snapshotKey, JSON.stringify(data), nowIso()],
    );
  }

  private async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();

    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  private decodeSnapshotState(rawState: unknown): StoreData {
    if (!rawState) {
      return createEmptyStoreData();
    }

    const parsed =
      typeof rawState === 'string'
        ? (JSON.parse(rawState) as StoreData)
        : (rawState as StoreData);

    return cloneStoreData(parsed);
  }
}
