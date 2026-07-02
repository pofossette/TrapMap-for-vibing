import type { StoreData } from './store-data.js';

export interface SkillShareerStore {
  snapshot(): Promise<StoreData>;
  transact<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T>;
  nextId(data: StoreData, prefix: string): string;
  getPool?(): import('pg').Pool;
}

export interface PostgresTransactionalStore extends SkillShareerStore {
  transactWithPgClient<T>(
    mutator: (data: StoreData, client: import('pg').PoolClient) => Promise<T> | T,
  ): Promise<T>;
}
