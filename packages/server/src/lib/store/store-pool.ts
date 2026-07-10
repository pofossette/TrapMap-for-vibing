import type { Pool } from 'pg';

import type { SkillShareerStore } from './store-interface.js';

export interface PoolBackedStore extends SkillShareerStore {
  getPool(): Pool;
}

export function isPoolBackedStore(store: SkillShareerStore): store is PoolBackedStore {
  return typeof store.getPool === 'function';
}

export function getStorePool(store: SkillShareerStore): Pool | null {
  return isPoolBackedStore(store) ? store.getPool() : null;
}
