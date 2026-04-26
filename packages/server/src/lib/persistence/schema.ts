import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type { StoreData } from '../store.js';

/**
 * Single-row table that persists the full StoreData aggregate as JSONB.
 * This is the compatibility layer that lets existing services keep their
 * snapshot/transact/nextId mutation model while moving durability to PostgreSQL.
 */
export const storeSnapshot = pgTable('store_snapshot', {
  /** Singleton key - always 'main' */
  key: text('key').primaryKey().default('main'),
  /** Full StoreData aggregate serialized as JSONB */
  data: jsonb('data').notNull().$type<StoreData>(),
  /** Last write timestamp for debugging/monitoring */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
