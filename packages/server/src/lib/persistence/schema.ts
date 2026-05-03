import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
  pgSequence,
  index,
} from 'drizzle-orm/pg-core';

import type {
  AnalysisSnapshot,
  Boundary,
  CandidatePayload,
  DuplicateCase,
  LifecycleState,
} from '@trapmap/contracts';
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
 * Knowledge entry Embedding vector for pgvector similarity search.
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

// =============================================================================
// Candidate Pipeline Tables (Phase 61: WRITE-01)
// =============================================================================

/**
 * Candidate submission table for async ingestion pipeline.
 * Each row represents a single candidate with its own lock scope,
 * enabling concurrent processing without blocking other candidates.
 *
 * Replaces JSONB snapshot access for candidate data, providing row-level
 * granularity via SELECT FOR UPDATE instead of whole-snapshot locking.
 */
export const candidates = pgTable('candidates', {
  /** Unique candidate identifier (e.g., candidate_abc123) */
  id: text('id').primaryKey(),
  /** Source type: 'trap' or 'skill' */
  sourceType: text('source_type').notNull(),
  /** User who submitted this candidate */
  submittedBy: text('submitted_by').notNull(),
  /** Team ID if team-scoped, null for global */
  teamId: text('team_id'),
  /** Current processing status */
  status: text('status').notNull(),
  /** Original payload before any transformation */
  originalPayload: jsonb('original_payload').notNull().$type<CandidatePayload>(),
  /** Analysis snapshot (null until analysis completes) */
  analysisSnapshot: jsonb('analysis_snapshot').$type<AnalysisSnapshot | null>(),
  /** Duplicate case (null if no duplicates detected) */
  duplicateCase: jsonb('duplicate_case').$type<DuplicateCase | null>(),
  /** When the candidate was received */
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  /** When the candidate was queued for processing */
  queuedAt: timestamp('queued_at', { withTimezone: true }),
  /** When analysis started */
  analyzingAt: timestamp('analyzing_at', { withTimezone: true }),
  /** When processing completed */
  completedAt: timestamp('completed_at', { withTimezone: true }),
  /** Last error message if status is 'error' */
  lastError: text('last_error'),
  /** Number of retry attempts */
  retryCount: integer('retry_count').notNull().default(0),
  /** Manual result from reviewer (null if no manual review yet) */
  manualResult: jsonb('manual_result'),
  /** Record creation timestamp */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Record update timestamp */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// Knowledge Entry Tables (Phase 62: WRITE-02)
// =============================================================================

/**
 * SEQUENCE for knowledge entry ID generation.
 * Provides monotonic ID values for knowledge_entries table.
 */
export const knowledgeEntryIdSeq = pgSequence('knowledge_entry_id_seq', {
  startWith: 1,
  increment: 1,
});

/**
 * Knowledge entries table for row-level storage of knowledge data.
 * Each row represents a single knowledge entry with its current state.
 * Enables row-level locking and concurrent access without blocking other entries.
 */
export const knowledgeEntries = pgTable(
  'knowledge_entries',
  {
    /** Unique entry identifier (e.g., knowledge_123) */
    id: text('id').primaryKey(),
    /** Team ID if team-scoped, null for global */
    teamId: text('team_id'),
    /** Scope: 'global' or 'project' */
    scope: text('scope').notNull(),
    /** Labels for filtering and categorization */
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    /** Short description for list views */
    shortcut: text('shortcut').notNull(),
    /** Full detail content */
    detail: text('detail').notNull(),
    /** Required security level for access control */
    requiredLevel: integer('required_level').notNull().default(0),
    /** Current lifecycle state */
    lifecycleState: text('lifecycle_state').notNull().$type<LifecycleState>(),
    /** Owner/creator user ID */
    ownerUserId: text('owner_user_id').notNull(),
    /** Boundary constraints for knowledge applicability (null if no boundary) */
    boundary: jsonb('boundary').$type<Boundary | null>(),
    /** Maintenance metadata for ownership and review-due tracking (null if not assigned) */
    maintenanceMeta: jsonb('maintenance_meta').$type<
      | {
          maintainerUserId: string | null;
          maintainerHandle: string | null;
          maintainerLevel: number | null;
          reviewBy: string | null;
        }
      | null
    >(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_entries_lifecycle_state').on(table.lifecycleState),
    index('idx_knowledge_entries_team').on(table.teamId),
  ],
);

/**
 * Knowledge revisions table for immutable revision history.
 * Each row captures a snapshot of entry content at a point in time.
 */
export const knowledgeRevisions = pgTable(
  'knowledge_revisions',
  {
    /** Composite key: {entry_id}_rev{revision} */
    id: text('id').primaryKey(),
    /** Reference to parent knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Monotonically increasing revision number */
    revision: integer('revision').notNull(),
    /** When this revision was submitted */
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    /** User who submitted this revision */
    submittedByUserId: text('submitted_by_user_id').notNull(),
    /** Short description for this revision */
    shortcut: text('shortcut').notNull(),
    /** Full detail content for this revision */
    detail: text('detail').notNull(),
    /** Labels for this revision */
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    /** Review notes attached to this revision */
    reviewNotes: jsonb('review_notes')
      .notNull()
      .$type<
        Array<{
          id: string;
          createdAt: string;
          authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
          authorUserId: string | null;
          message: string;
        }>
      >()
      .default([]),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_knowledge_revisions_entry').on(table.entryId)],
);

/**
 * Lifecycle events table for audit trail of state transitions.
 * Each row records a state change with actor and context.
 */
export const lifecycleEvents = pgTable(
  'lifecycle_events',
  {
    /** Unique event identifier */
    id: text('id').primaryKey(),
    /** Reference to parent knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Event type: submitted, resubmitted, agent-reviewed, etc. */
    type: text('type')
      .notNull()
      .$type<
        | 'submitted'
        | 'resubmitted'
        | 'agent-reviewed'
        | 'reviewer-approved'
        | 'reviewer-rejected'
        | 'updated'
        | 'deactivated'
      >(),
    /** When this event occurred */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** User who triggered this event (null for system events) */
    actorUserId: text('actor_user_id'),
    /** Related submission ID if applicable */
    submissionId: text('submission_id'),
    /** Related revision number if applicable */
    revision: integer('revision'),
    /** The lifecycle state after this event */
    state: text('state').notNull().$type<LifecycleState>(),
    /** Optional note explaining the transition */
    note: text('note'),
  },
  (table) => [index('idx_lifecycle_events_entry').on(table.entryId)],
);
