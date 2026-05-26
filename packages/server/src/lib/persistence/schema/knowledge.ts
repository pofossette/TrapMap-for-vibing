/**
 * Knowledge domain tables.
 *
 * Covers: knowledge entries, revisions, lifecycle events, boundary sub-tables,
 * maintenance assignments, embeddings, keywords, search documents,
 * feedback, usage analytics, and domain event outbox.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

import type { Boundary, LifecycleState } from '@trapmap/contracts';

// =============================================================================
// Sequences
// =============================================================================

/**
 * SEQUENCE for knowledge entry ID generation.
 * Provides monotonic ID values for knowledge_entries table.
 */
export const knowledgeEntryIdSeq = pgSequence('knowledge_entry_id_seq', {
  startWith: 1,
  increment: 1,
});

// =============================================================================
// Retrieval Index Tables (Phase: pgvector Migration)
// =============================================================================

/**
 * Knowledge entry Embedding vector for pgvector similarity search.
 * Stores one row per entry revision with the computed embedding.
 * Enables O(log n) similarity search via HNSW index vs O(n) in-memory scan.
 *
 * HNSW Index (created by ensureVectorIndex in db-search.ts):
 * ```sql
 * CREATE INDEX knowledge_embeddings_vector_idx
 * ON knowledge_embeddings
 * USING hnsw (vector vector_cosine_ops)
 * WITH (m = 16, ef_construction = 64);
 * ```
 *
 * The HNSW index is not defined here as Drizzle ORM doesn't natively support
 * custom index types. The index is created programmatically during server
 * startup via ensureVectorIndex() in packages/server/src/lib/retrieval/db-search.ts.
 */
export const knowledgeEmbeddings = pgTable(
  'knowledge_embeddings',
  {
    /** Composite key: entry_{entryId}_rev{revisionNo} */
    id: text('id').primaryKey(),
    /** Foreign key reference to knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Entry revision number for idempotency checks */
    revisionNo: integer('revision_no').notNull(),
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
    /** Labels for filtering and boosting — native text[] */
    labels: text('labels').array().notNull().default([]),
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
    uniqueIndex('knowledge_embeddings_entry_revision_no_idx').on(table.entryId, table.revisionNo),
    index('idx_knowledge_embeddings_status').on(table.status),
  ],
);

/**
 * Knowledge entry keyword tokens for PostgreSQL text search.
 * Stores tokenized content for lexical matching with field-level weights.
 */
export const knowledgeKeywords = pgTable(
  'knowledge_keywords',
  {
    /** Composite key: entry_{entryId}_rev{revisionNo} */
    id: text('id').primaryKey(),
    /** Foreign key reference to knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Entry revision number for idempotency checks */
    revisionNo: integer('revision_no').notNull(),
    /** SHA-256 hash of canonical text for change detection */
    contentHash: text('content_hash').notNull(),
    /** Normalized tokens (lowercase, deduplicated) — native text[] for GIN array overlap */
    tokens: text('tokens').array().notNull().default([]),
    /** Per-field token sets: shortcut field tokens */
    fieldTokensShortcut: text('field_tokens_shortcut').array().notNull().default([]),
    /** Per-field token sets: detail field tokens */
    fieldTokensDetail: text('field_tokens_detail').array().notNull().default([]),
    /** Per-field token sets: label field tokens */
    fieldTokensLabels: text('field_tokens_labels').array().notNull().default([]),
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
    uniqueIndex('knowledge_keywords_entry_revision_no_idx').on(table.entryId, table.revisionNo),
    // GIN index for fast text[] overlap queries using && operator
    index('idx_knowledge_keywords_tokens_gin').using('gin', table.tokens),
    index('idx_knowledge_keywords_status').on(table.status),
  ],
);

/**
 * Knowledge search documents for PostgreSQL full-text search using tsvector.
 * Derived index table — not a source of business truth.
 * Replaces keyword-level JSONB token matching with native tsvector ranking.
 */
export const knowledgeSearchDocuments = pgTable(
  'knowledge_search_documents',
  {
    /** Reference to knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Revision number for idempotent sync */
    revisionNo: integer('revision_no').notNull(),
    /** tsvector document for full-text search */
    document: text('document').notNull(), // stored as tsvector via raw SQL
    /** Lightweight label copy for array filtering */
    labels: text('labels').array().notNull().default([]),
    /** Sync status: 'synced' | 'stale' | 'failed' */
    status: text('status').notNull().default('synced'),
    /** Last error if sync failed */
    lastError: text('last_error'),
    /** When this document was last updated */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.revisionNo] }),
    index('idx_knowledge_search_documents_entry').on(table.entryId),
    index('idx_knowledge_search_documents_status').on(table.status),
    // GIN index on tsvector document is created in migration 0005.
    // Cannot be declared here because Drizzle schema uses text() for the column
    // (tsvector has no native Drizzle type) and GIN on text is invalid.
  ],
);

// =============================================================================
// Knowledge Entry Tables (Phase 62: WRITE-02)
// =============================================================================

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
    maintenanceMeta: jsonb('maintenance_meta').$type<{
      maintainerUserId: string | null;
      maintainerHandle: string | null;
      maintainerLevel: number | null;
      reviewBy: string | null;
    } | null>(),
    /** Cached embedding vector and metadata for semantic search */
    embeddingCache: jsonb('embedding_cache').$type<{
      textHash: string;
      vector: number[];
      createdAt: string;
      revision: number;
    } | null>(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_entries_lifecycle_state').on(table.lifecycleState),
    index('idx_knowledge_entries_team').on(table.teamId),
    index('idx_knowledge_entries_scope_level').on(table.scope, table.requiredLevel),
    index('idx_knowledge_entries_owner').on(table.ownerUserId),
    check('ck_knowledge_entries_scope', sql`${table.scope} IN ('global', 'project')`),
    check(
      'ck_knowledge_entries_lifecycle_state',
      sql`${table.lifecycleState} IN ('draft', 'submitted', 'agent-pass', 'agent-rejected', 'approved', 'rejected', 'deactivated')`,
    ),
    check(
      'ck_knowledge_entries_required_level',
      sql`${table.requiredLevel} >= 0 AND ${table.requiredLevel} <= 10`,
    ),
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
    revisionNo: integer('revision_no').notNull(),
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
  (table) => [
    index('idx_knowledge_revisions_entry').on(table.entryId),
    uniqueIndex('idx_knowledge_revisions_entry_revision_no').on(table.entryId, table.revisionNo),
  ],
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
    revisionNo: integer('revision_no'),
    /** The lifecycle state after this event */
    state: text('state').notNull().$type<LifecycleState>(),
    /** Optional note explaining the transition */
    note: text('note'),
  },
  (table) => [
    index('idx_lifecycle_events_entry').on(table.entryId),
    check(
      'ck_lifecycle_events_type',
      sql`${table.type} IN ('submitted', 'resubmitted', 'agent-reviewed', 'reviewer-approved', 'reviewer-rejected', 'updated', 'deactivated')`,
    ),
  ],
);

// =============================================================================
// Knowledge Domain Sub-Tables (Round 3: Structural Refactoring)
// =============================================================================

/**
 * Structured label storage for knowledge entries.
 * Replaces JSONB labels array for queryable, indexable label filtering.
 * Each row is one (entry, label) pair.
 */
export const knowledgeLabels = pgTable(
  'knowledge_labels',
  {
    /** Reference to parent knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Label value */
    label: text('label').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_knowledge_labels_entry_label').on(table.entryId, table.label),
    index('idx_knowledge_labels_label').on(table.label),
  ],
);

/**
 * Boundary context labels for knowledge entries.
 * Stores the situational context labels (e.g., 'frontend', 'production').
 */
export const knowledgeBoundaryContexts = pgTable(
  'knowledge_boundary_contexts',
  {
    /** Internal primary key */
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Reference to parent knowledge entry */
    entryId: text('entry_id').notNull(),
    /** Context label value */
    contextValue: text('context_value').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_boundary_contexts_entry').on(table.entryId),
    uniqueIndex('idx_knowledge_boundary_contexts_entry_value').on(
      table.entryId,
      table.contextValue,
    ),
  ],
);

/**
 * Boundary version constraints for knowledge entries.
 * Stores semver-compatible version ranges for tools and libraries.
 */
export const knowledgeBoundaryVersions = pgTable(
  'knowledge_boundary_versions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    entryId: text('entry_id').notNull(),
    /** Package or tool name (e.g., 'react', 'node') */
    packageName: text('package_name').notNull(),
    /** Version range in semver-compatible syntax (e.g., '>=16.8.0') */
    rangeValue: text('range_value').notNull(),
    /** Optional note explaining the constraint */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_knowledge_boundary_versions_entry').on(table.entryId)],
);

/**
 * Boundary prerequisites for knowledge entries.
 * Stores conditions that must be satisfied before applying knowledge.
 */
export const knowledgeBoundaryPrerequisites = pgTable(
  'knowledge_boundary_prerequisites',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    entryId: text('entry_id').notNull(),
    /** Human-readable condition description */
    description: text('description').notNull(),
    /** Condition type: environment, permission, tool, configuration, other */
    kind: text('kind'),
    /** Whether this condition is required (default) or optional */
    required: integer('required').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_knowledge_boundary_prerequisites_entry').on(table.entryId)],
);

/**
 * Boundary signal matchers for knowledge entries.
 * Stores patterns indicating knowledge relevance.
 */
export const knowledgeBoundarySignals = pgTable(
  'knowledge_boundary_signals',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    entryId: text('entry_id').notNull(),
    /** Pattern to match */
    pattern: text('pattern').notNull(),
    /** Pattern type: exact, keyword, regex, error-code, log-pattern */
    kind: text('kind').notNull().default('keyword'),
    /** Optional description of when this signal fires */
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_knowledge_boundary_signals_entry').on(table.entryId)],
);

/**
 * Boundary exclusion rules for knowledge entries.
 * Stores conditions that make knowledge NOT applicable.
 */
export const knowledgeBoundaryExclusions = pgTable(
  'knowledge_boundary_exclusions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    entryId: text('entry_id').notNull(),
    /** Human-readable exclusion description */
    description: text('description').notNull(),
    /** Exclusion category: platform, version, context, configuration, other */
    kind: text('kind'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_knowledge_boundary_exclusions_entry').on(table.entryId)],
);

/**
 * Boundary evidence references for knowledge entries.
 * Stores links to external sources that validate the boundary.
 */
export const knowledgeBoundaryEvidence = pgTable(
  'knowledge_boundary_evidence',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    entryId: text('entry_id').notNull(),
    /** Evidence source type: issue, incident, cve, documentation, test, commit, other */
    kind: text('kind').notNull(),
    /** Reference identifier (issue number, CVE ID, commit hash, etc.) */
    identifier: text('identifier').notNull(),
    /** Optional URL to the evidence source */
    url: text('url'),
    /** Optional note about relevance */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_knowledge_boundary_evidence_entry').on(table.entryId)],
);

/**
 * Structured maintenance assignments for knowledge entries.
 * Replaces JSONB maintenance_meta for queryable ownership and review tracking.
 */
export const knowledgeMaintenanceAssignments = pgTable(
  'knowledge_maintenance_assignments',
  {
    /** Reference to parent knowledge entry (1:1 relationship) */
    entryId: text('entry_id').primaryKey(),
    /** Maintainer user ID (null if unassigned) */
    maintainerUserId: text('maintainer_user_id'),
    /** Maintainer handle for read-optimization */
    maintainerHandle: text('maintainer_handle'),
    /** Maintainer security level */
    maintainerLevel: integer('maintainer_level'),
    /** Review deadline (null if not set) */
    reviewBy: timestamp('review_by', { withTimezone: true }),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_maintenance_assignments_maintainer').on(table.maintainerUserId),
    index('idx_knowledge_maintenance_assignments_review_by').on(table.reviewBy),
  ],
);

// =============================================================================
// Feedback Tables (Round 6: Structural Refactoring)
// =============================================================================

/**
 * Feedback records table for structured feedback persistence.
 * Replaces the feedbackQueue array inside store_snapshot JSONB.
 * Each row represents a single user feedback submission against
 * a knowledge entry or skill artifact.
 */
export const feedbackRecords = pgTable(
  'feedback_records',
  {
    /** Unique feedback identifier (e.g., feedback_abc123) */
    id: text('id').primaryKey(),
    /** Target entry ID (knowledge or artifact) */
    entryId: text('entry_id').notNull(),
    /** Target entry type */
    entryType: text('entry_type').notNull(),
    /** Problem category */
    problemType: text('problem_type').notNull(),
    /** User-provided description of the problem */
    description: text('description').notNull(),
    /** Optional context about when/where the problem occurred */
    context: text('context'),
    /** Original query that surfaced the problem */
    querySeed: text('query_seed'),
    /** When the feedback was submitted */
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    /** User who submitted the feedback */
    submittedByUserId: text('submitted_by_user_id').notNull(),
    /** Submitter handle for read-optimization */
    submittedByHandle: text('submitted_by_handle').notNull(),
    /** Processing status */
    status: text('status').notNull().default('new'),
    /** Admin notes from triage/review */
    adminNotes: text('admin_notes'),
    /** When the feedback was resolved (null if unresolved) */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** User who resolved the feedback */
    resolvedByUserId: text('resolved_by_user_id'),
    /** Lifecycle transition triggered by this feedback */
    triggeredTransition: text('triggered_transition'),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_feedback_records_entry').on(table.entryId),
    index('idx_feedback_records_entry_type').on(table.entryType),
    index('idx_feedback_records_status').on(table.status),
    index('idx_feedback_records_problem_type').on(table.problemType),
    index('idx_feedback_records_submitted_by').on(table.submittedByUserId),
    check('ck_feedback_records_entry_type', sql`${table.entryType} IN ('trap', 'skill')`),
    check(
      'ck_feedback_records_problem_type',
      sql`${table.problemType} IN ('incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other')`,
    ),
    check(
      'ck_feedback_records_status',
      sql`${table.status} IN ('new', 'triaged', 'resolved', 'dismissed')`,
    ),
  ],
);

/**
 * Custom Q&A answers attached to feedback records.
 * Stores user-provided answers to structured prompts during feedback submission.
 */
export const feedbackCustomAnswers = pgTable(
  'feedback_custom_answers',
  {
    /** Internal primary key */
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Reference to parent feedback record */
    feedbackId: text('feedback_id').notNull(),
    /** Prompt key identifying the question */
    questionKey: text('question_key').notNull(),
    /** User's answer text */
    answerText: text('answer_text').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_feedback_custom_answers_feedback').on(table.feedbackId)],
);

// =============================================================================
// Usage Analytics Tables (Phase 89)
// =============================================================================

/**
 * Usage events table for recording retrieval hits.
 * Each row represents one hit on a knowledge entry or skill artifact.
 * Enables time-series analytics and hit ranking queries.
 */
export const usageEvents = pgTable(
  'usage_events',
  {
    /** Unique event identifier */
    id: text('id').primaryKey(),
    /** Query ID grouping hits from same search request */
    queryId: text('query_id').notNull(),
    /** Team ID (maps to "organization" in requirements) */
    teamId: text('team_id'),
    /** Account ID of the user who made the request */
    accountId: text('account_id').notNull(),
    /** Entry type: 'skill' | 'trap' | 'knowledge' */
    entryType: text('entry_type').notNull(),
    /** The hit entry's ID */
    entryId: text('entry_id').notNull(),
    /** Optional original query text */
    queryText: text('query_text'),
    /** Event timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Composite indexes matching query patterns
    index('idx_usage_events_team_created').on(table.teamId, table.createdAt),
    index('idx_usage_events_account_created').on(table.accountId, table.createdAt),
    index('idx_usage_events_entry_type_created').on(table.entryType, table.createdAt),
    index('idx_usage_events_entry_id_created').on(table.entryId, table.createdAt),
  ],
);

// =============================================================================
// Usage Analytics Rollup Tables (Round 6)
// =============================================================================

/**
 * Daily rollup table for usage event aggregation.
 * Pre-aggregated counts per (day, team, entry_type, entry_id) to avoid
 * scanning the full usage_events table for common analytics queries.
 */
export const usageEventsDailyRollup = pgTable(
  'usage_events_daily_rollup',
  {
    /** Internal primary key */
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Aggregation day (date only, no time) */
    day: timestamp('day', { withTimezone: true }).notNull(),
    /** Team ID (null for global) */
    teamId: text('team_id'),
    /** Entry type: 'skill' | 'trap' | 'knowledge' */
    entryType: text('entry_type').notNull(),
    /** The hit entry's ID */
    entryId: text('entry_id').notNull(),
    /** Number of hits on this day */
    hitCount: integer('hit_count').notNull(),
    /** Number of distinct queries */
    uniqueQueries: integer('unique_queries').notNull(),
    /** Number of distinct accounts */
    uniqueAccounts: integer('unique_accounts').notNull(),
    /** When this rollup was last updated */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_usage_rollup_day_team_entry').on(
      table.day,
      table.teamId,
      table.entryType,
      table.entryId,
    ),
    index('idx_usage_rollup_entry_type_day').on(table.entryType, table.day),
    index('idx_usage_rollup_entry_id_day').on(table.entryId, table.day),
  ],
);

// =============================================================================
// Domain Event Outbox (Round 10 Phase 2)
// =============================================================================

export const domainEventOutbox = pgTable(
  'domain_event_outbox',
  {
    id: text('id').primaryKey(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventName: text('event_name').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('pending'),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('domain_event_outbox_pending_idx')
      .on(table.eventName, table.availableAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);
