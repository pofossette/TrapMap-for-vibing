import type { Pool } from 'pg';

import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

export {
  JsonStore,
  createEmptyStoreData,
  // fallow-ignore-next-line unused-export
  createOpaqueToken,
  // fallow-ignore-next-line unused-export
  createSlug,
  // fallow-ignore-next-line unused-export
  hashSecret,
  // fallow-ignore-next-line unused-export
  nowIso,
} from '@trapmap/server/lib/store.js';
export type {
  // fallow-ignore-next-line unused-type
  PostgresTransactionalStore,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';

export function getStorePool(store: SkillShareerStore): Pool | null {
  return typeof store.getPool === 'function' ? store.getPool() : null;
}
