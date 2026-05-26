/**
 * Persistence schema barrel export.
 *
 * Re-exports all domain table and sequence definitions.
 * Each domain module groups related tables logically.
 *
 * @module persistence/schema
 */

import type { StoreData } from '@trapmap/server/lib/store.js';
// Compatibility: store snapshot table (singleton JSONB aggregate)
import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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

// Domain re-exports
export * from './auth.js';
export * from './candidates.js';
export * from './knowledge.js';
export * from './artifacts.js';
export * from './retrieval.js';
export * from './queue.js';
