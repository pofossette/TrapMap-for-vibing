/**
 * Shared knowledge domain tables.
 *
 * Covers: knowledge entries, revisions, lifecycle events, boundary sub-tables,
 * maintenance assignments, embeddings, keywords, search documents,
 * feedback, usage analytics, and domain event outbox.
 */

import type { Boundary, LifecycleState } from '@trapmap/contracts';
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
import { auditTimestamps, lifecycleEventColumns, revisionColumns } from './column-factories.js';

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
 * HNSW Index (created by migration SQL):
 * ```sql
 * CREATE INDEX knowledge_embeddings_vector_idx
 * ON knowledge_embeddings
 * USING hnsw (vector vector_cosine_ops)
 * WITH (m = 16, ef_construction = 64);
 * ```
 *
 * The HNSW index is not defined here as Drizzle ORM doesn't natively support
 * custom index types. The index is created via SQL migration files (see
 * drizzle/*.sql, e.g. 0000_sharp_talos.sql in service-knowledge-read).
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
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('knowledge_embeddings_entry_revision_no_idx').on(table.entryId, table.revisionNo),
    index('idx_knowledge_embeddings_status').on(table.status),
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
    document: text('document').notNull(),
    /** Consolidated keyword tokens (was knowledge_keywords.tokens GIN) */
    tokens: text('tokens').array().notNull().default([]),
    fieldTokensShortcut: text('field_tokens_shortcut').array().notNull().default([]),
    fieldTokensDetail: text('field_tokens_detail').array().notNull().default([]),
    fieldTokensLabels: text('field_tokens_labels').array().notNull().default([]),
    contentHash: text('content_hash').notNull().default(''),
    teamId: text('team_id'),
    scope: text('scope').notNull().default('project'),
    requiredLevel: integer('required_level').notNull().default(0),
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
    index('idx_knowledge_search_documents_tokens_gin').using('gin', table.tokens),
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
    /** Submission counters and current decision metadata. */
    metadata: jsonb('metadata').notNull().$type<Record<string, unknown>>().default({}),
    /** Latest automated review decision for the entry. */
    agentReview: jsonb('agent_review').$type<Record<string, unknown> | null>(),
    /** Derived index state retained until the read owner rebuilds its projections. */
    indexState: jsonb('index_state').$type<Record<string, unknown> | null>(),
    /** Decay policy state for lifecycle maintenance. */
    decayMeta: jsonb('decay_meta').$type<Record<string, unknown> | null>(),
    /** Evidence and provenance metadata attached to the entry. */
    evidenceMeta: jsonb('evidence_meta').$type<Record<string, unknown> | null>(),
    /** Feedback remediation state owned by the knowledge record. */
    remediation: jsonb('remediation').$type<Record<string, unknown> | null>(),

    // -- DiveLog columns (Round 11) -------------------------------------------

    /** Stable DiveLog document identifier (e.g., divelog_abc123) */
    diveLogId: text('dive_log_id'),
    /** Human-readable dive site name (e.g., "Great Barrier Reef - Cod Hole") */
    diveSite: text('dive_site'),
    /** Slang / jargon level the raw content was authored in */
    slangLevel: text('slang_level'),
    /** Original raw content submitted by the user before template normalisation */
    rawContent: text('raw_content'),
    /** Structured DiveLog blocks produced by dive_summary normalisation */
    parsedBlocks: jsonb('parsed_blocks').$type<Record<string, unknown>[] | null>(),
    /** Template ID used for raw_content → detail normalisation (null if none applied) */
    templateId: text('template_id'),
    /** Whether this entry is pinned in the dive-log UI */
    pinned: integer('pinned').notNull().default(0),
    /** Whether this entry has been archived */
    archived: integer('archived').notNull().default(0),

    /** Record creation timestamp */
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_knowledge_entries_lifecycle_state').on(table.lifecycleState),
    index('idx_knowledge_entries_team').on(table.teamId),
    index('idx_knowledge_entries_scope_level').on(table.scope, table.requiredLevel),
    index('idx_knowledge_entries_owner').on(table.ownerUserId),
    index('idx_knowledge_entries_dive_log_id').on(table.diveLogId),
    index('idx_knowledge_entries_boundary_gin').using('gin', table.boundary),
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
    ...revisionColumns(),
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
  },
  (table) => [
    index('idx_knowledge_revisions_entry').on(table.entryId),
    uniqueIndex('idx_knowledge_revisions_entry_revision_no').on(table.entryId, table.revisionNo),
  ],
);

/**
 * Submission aggregates preserve the state captured at each submission.
 * They are distinct from revisions because a revision can be edited without
 * entering a review lifecycle.
 */
export const knowledgeSubmissions = pgTable(
  'knowledge_submissions',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    lifecycleState: text('lifecycle_state').notNull().$type<LifecycleState>(),
    resubmissionOf: text('resubmission_of'),
    agentReview: jsonb('agent_review').$type<Record<string, unknown> | null>(),
    reviewerDecision: jsonb('reviewer_decision').$type<Record<string, unknown> | null>(),
    reviewNotes: jsonb('review_notes').notNull().$type<Record<string, unknown>[]>().default([]),
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_knowledge_submissions_entry').on(table.entryId),
    uniqueIndex('idx_knowledge_submissions_entry_revision').on(table.entryId, table.revisionNo),
  ],
);

/**
 * Lifecycle events table for audit trail of state transitions.
 * Each row records a state change with actor and context.
 */
export const lifecycleEvents = pgTable(
  'lifecycle_events',
  {
    /** Reference to parent knowledge entry */
    entryId: text('entry_id').notNull(),
    ...lifecycleEventColumns(),
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

/**
 * Boundary version constraints for knowledge entries.
 * Stores semver-compatible version ranges for tools and libraries.
 */

/**
 * Boundary prerequisites for knowledge entries.
 * Stores conditions that must be satisfied before applying knowledge.
 */

/**
 * Boundary signal matchers for knowledge entries.
 * Stores patterns indicating knowledge relevance.
 */

/**
 * Boundary exclusion rules for knowledge entries.
 * Stores conditions that make knowledge NOT applicable.
 */

/**
 * Boundary evidence references for knowledge entries.
 * Stores links to external sources that validate the boundary.
 */

// =============================================================================
// Feedback Tables (Round 6: Structural Refactoring)
// =============================================================================

/**
 * Feedback records table for structured feedback persistence.
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
    /** Public query identifier tied to retrieval responses */
    queryId: text('query_id'),
    /** Route family for reproducibility */
    routeFamily: text('route_family'),
    /** Failure classification for badcase capture */
    failureClassification: text('failure_classification'),
    /** Expected correction / desired behavior */
    expectedCorrection: text('expected_correction'),
    /** Selected result snapshot used to reproduce the failure */
    selectedResultSnapshot: jsonb('selected_result_snapshot'),
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
    /** Derived remediation status for escalated entries */
    remediationStatus: text('remediation_status'),
    /** When remediation was opened */
    remediationOpenedAt: timestamp('remediation_opened_at', { withTimezone: true }),
    /** Who opened remediation */
    remediationOpenedByUserId: text('remediation_opened_by_user_id'),
    /** When remediation was resolved */
    remediationResolvedAt: timestamp('remediation_resolved_at', { withTimezone: true }),
    /** Who resolved remediation */
    remediationResolvedByUserId: text('remediation_resolved_by_user_id'),
    /** Low-freq custom Q&A consolidated to JSONB (was feedback_custom_answers table) */
    customAnswers: jsonb('custom_answers')
      .$type<Array<{ prompt: string; answer: string }> | null>()
      .default(null),
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_feedback_records_entry').on(table.entryId),
    index('idx_feedback_records_entry_type').on(table.entryType),
    index('idx_feedback_records_status').on(table.status),
    index('idx_feedback_records_problem_type').on(table.problemType),
    index('idx_feedback_records_submitted_by').on(table.submittedByUserId),
    index('idx_feedback_records_custom_answers_gin').using('gin', table.customAnswers),
    check('ck_feedback_records_entry_type', sql`${table.entryType} IN ('trap', 'skill')`),
    check(
      'ck_feedback_records_problem_type',
      sql`${table.problemType} IN ('incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other')`,
    ),
    check(
      'ck_feedback_records_status',
      sql`${table.status} IN ('new', 'triaged', 'resolved', 'dismissed')`,
    ),
    check(
      'ck_feedback_records_remediation_status',
      sql`${table.remediationStatus} IS NULL OR ${table.remediationStatus} IN ('pending-human-review', 'in-remediation', 'ready-to-reindex')`,
    ),
  ],
);

/**
 * Custom Q&A answers attached to feedback records.
 * Stores user-provided answers to structured prompts during feedback submission.
 */

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
    workerId: text('worker_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => [
    index('domain_event_outbox_pending_idx')
      .on(table.eventName, table.availableAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index('domain_event_outbox_processing_lease_idx')
      .on(table.eventName, table.leaseUntil, table.createdAt)
      .where(sql`${table.status} = 'processing'`),
  ],
);
