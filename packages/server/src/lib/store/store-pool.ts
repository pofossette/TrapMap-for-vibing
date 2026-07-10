import type { Pool } from 'pg';

import type { PostgresTransactionalStore, SkillShareerStore } from './store-interface.js';

export interface PoolBackedStore extends SkillShareerStore {
  getPool(): Pool;
}

export function isPoolBackedStore(store: SkillShareerStore): store is PoolBackedStore {
  return typeof store.getPool === 'function';
}

export function getStorePool(store: SkillShareerStore): Pool | null {
  return isPoolBackedStore(store) ? store.getPool() : null;
}

export function isPostgresTransactionalStore(
  store: SkillShareerStore,
): store is PostgresTransactionalStore {
  return typeof (store as PostgresTransactionalStore).transactWithPgClient === 'function';
}
