export interface PoolBackedStore<TPool> {
  getPool?(): TPool;
}

export function getHostLocalStorePool<TPool>(store: PoolBackedStore<TPool>): TPool | null {
  return typeof store.getPool === 'function' ? store.getPool() : null;
}
