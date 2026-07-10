import { describe, expect, it } from 'vitest';

import type { SkillShareerStore } from './store.js';
import { getStorePool } from './store.js';

function createStore(overrides: Partial<SkillShareerStore> = {}): SkillShareerStore {
  return {
    async snapshot() {
      throw new Error('not needed');
    },
    async transact() {
      throw new Error('not needed');
    },
    nextId() {
      throw new Error('not needed');
    },
    ...overrides,
  };
}

describe('runtime-infra store seam', () => {
  it('returns a pool from stores that expose getPool structurally', () => {
    const pool = { query: async () => ({ rows: [] }) };
    const store = createStore({
      getPool: () => pool as never,
    });

    expect(getStorePool(store)).toBe(pool);
  });

  it('returns null for stores without pool access', () => {
    const store = createStore();

    expect(getStorePool(store)).toBeNull();
  });
});
