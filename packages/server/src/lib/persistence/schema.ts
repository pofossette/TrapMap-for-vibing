import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, vector } from 'drizzle-orm/pg-core';

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

// =============================================================================
// Retrieval Index Tables (Phase: pgvector Migration)
// =============================================================================

/**
 * Knowledge entry embedding vector for pgvector similarity search.
 * Stores one row per entry revision with the computed embedding.
 * Enables O(log n) similarity search via HNSW index vs O(n) in-memory scan.
 */
export const knowledgeEmbeddings = pgTable(
  'knowledge_embeddings',
  {
    /** Composite key: entry_{entryId}_rev{revision} */
    id: text('id').primaryKey(),
    /** Foreign key reference to knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Entry revision number for idempotency checks */
    revision: integer('revision').notNull(),
    /** SHA-256 hash of canonical text for change detection */
    contentHash: text('content_hash').notNull(),
    /** Embedding vector (384 dimensions, compatible with fallback provider) */
    vector: vector('vector', { dimensions: 384 }).notNull(),
    /** Team ID (null for global entries) */
    teamId: text('team_id'),
    /** Scope: 'global' or 'project' */
    scope: text('scope').notNull(),
    /** Required security level for access control */
    requiredLevel: integer('required_level').notNull().default(0),
    /** Labels for filtering and boosting */
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    /** Sync status: 'synced' | 'failed' */
    status: text('status').notNull().default('synced'),
    /** Last error message if sync failed */
    lastError: text('last_error'),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('knowledge_embeddings_entry_revision_idx').on(table.entryId, table.revision),
  ],
);

/**
 * Knowledge entry keyword tokens for PostgreSQL text search.
 * Stores tokenized content for lexical matching with field-level weights.
 */
export const knowledgeKeywords = pgTable(
  'knowledge_keywords',
  {
    /** Composite key: entry_{entryId}_rev{revision} */
    id: text('id').primaryKey(),
    /** Foreign key reference to knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Entry revision number for idempotency checks */
    revision: integer('revision').notNull(),
    /** SHA-256 hash of canonical text for change detection */
    contentHash: text('content_hash').notNull(),
    /** Normalized tokens (lowercase, deduplicated) */
    tokens: jsonb('tokens').notNull().$type<string[]>().default([]),
    /** Per-field token sets for targeted matching with weights */
    fieldTokens: jsonb('field_tokens')
      .notNull()
      .$type<{
        shortcut: string[];
        detail: string[];
        labels: string[];
      }>()
      .default({ shortcut: [], detail: [], labels: [] }),
    /** Team ID (null for global entries) */
    teamId: text('team_id'),
    /** Scope: 'global' or 'project' */
    scope: text('scope').notNull(),
    /** Required security level for access control */
    requiredLevel: integer('required_level').notNull().default(0),
    /** Sync status: 'synced' | 'failed' */
    status: text('status').notNull().default('synced'),
    /** Last error message if sync failed */
    lastError: text('last_error'),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('knowledge_keywords_entry_revision_idx').on(table.entryId, table.revision),
  ],
);
