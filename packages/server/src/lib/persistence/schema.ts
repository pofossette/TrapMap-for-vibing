import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

import type {
  AnalysisSnapshot,
  Boundary,
  CandidatePayload,
  DuplicateCase,
  LifecycleState,
  Scope,
} from '@trapmap/contracts';
import type { StoreData } from '@trapmap/server/lib/store.js';

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

/**
 * Graph index documents for GraphRAG-lite persistence.
 * Derived index table — not a source of business truth.
 * Replaces in-memory JSONB store_snapshot.graphIndexDocuments.
 */
export const graphIndexDocuments = pgTable(
  'graph_index_documents',
  {
    /** Unique document identifier (e.g., graphdoc_trap_knowledge_123_r1) */
    id: text('id').primaryKey(),
    /** Source type: 'trap' or 'skill' */
    sourceType: text('source_type').notNull(),
    /** Source entity identifier */
    sourceId: text('source_id').notNull(),
    /** Source revision number */
    revisionNo: integer('revision_no').notNull(),
    /** SHA-256 hash of document content */
    contentHash: text('content_hash').notNull(),
    /** Team ID (null for global) */
    teamId: text('team_id'),
    /** Governance scope */
    scope: text('scope').notNull(),
    /** Required security level */
    requiredLevel: integer('required_level').notNull().default(0),
    /** Graph nodes (JSONB array of typed node records) */
    nodes: jsonb('nodes')
      .notNull()
      .$type<
        Array<{
          id: string;
          kind: string;
          label: string;
          evidence: string;
        }>
      >()
      .default([]),
    /** Graph edges (JSONB array of typed edge records) */
    edges: jsonb('edges')
      .notNull()
      .$type<
        Array<{
          id: string;
          sourceNodeId: string;
          targetNodeId: string;
          relationType: string;
          strength: string;
          evidence: string;
        }>
      >()
      .default([]),
    /** Human-readable evidence description */
    evidence: text('evidence').notNull().default(''),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_graph_index_documents_source').on(table.sourceType, table.sourceId),
    uniqueIndex('idx_graph_index_documents_source_revision_no').on(
      table.sourceType,
      table.sourceId,
      table.revisionNo,
    ),
    index('idx_graph_index_documents_team').on(table.teamId),
    check('ck_graph_index_documents_source_type', sql`${table.sourceType} IN ('trap', 'skill')`),
    check('ck_graph_index_documents_scope', sql`${table.scope} IN ('global', 'project')`),
  ],
);

// =============================================================================
// Identity & Audit Domain Tables (Round 10 Phase 3)
// =============================================================================

export const userIdSeq = pgSequence('user_id_seq', {
  startWith: 1,
  increment: 1,
});

export const teamIdSeq = pgSequence('team_id_seq', {
  startWith: 1,
  increment: 1,
});

export const membershipIdSeq = pgSequence('membership_id_seq', {
  startWith: 1,
  increment: 1,
});

export const sessionIdSeq = pgSequence('session_id_seq', {
  startWith: 1,
  increment: 1,
});

export const accessKeyIdSeq = pgSequence('access_key_id_seq', {
  startWith: 1,
  increment: 1,
});

export const auditEventIdSeq = pgSequence('audit_event_id_seq', {
  startWith: 1,
  increment: 1,
});

export const usersTable = pgTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull().unique(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const teamsTable = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('teams_slug_uidx').on(table.slug)],
);

export const membershipsTable = pgTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id, { onDelete: 'cascade' }),
    roleTemplate: text('role_template').notNull(),
    securityLevel: integer('security_level').notNull(),
    permissions: jsonb('permissions').notNull().$type<string[]>().default([]),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('memberships_user_team_uidx').on(table.userId, table.teamId),
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_team_id_idx').on(table.teamId),
  ],
);

export const sessionsTable = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id').references(() => usersTable.id),
    activeTeamId: text('active_team_id').references(() => teamsTable.id),
    subjectType: text('subject_type').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_token_hash_idx').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export const accessKeysTable = pgTable(
  'access_keys',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => membershipsTable.id),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPreview: text('token_preview').notNull(),
    issuedByUserId: text('issued_by_user_id')
      .notNull()
      .references(() => usersTable.id),
    teamId: text('team_id')
      .notNull()
      .references(() => teamsTable.id),
    level: integer('level').notNull(),
    notes: text('notes'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('access_keys_token_hash_idx').on(table.tokenHash),
    index('access_keys_member_id_idx').on(table.memberId),
    index('access_keys_team_id_idx').on(table.teamId),
    index('access_keys_issued_by_user_id_idx').on(table.issuedByUserId),
  ],
);

export const auditEventsTable = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id'),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    entityId: text('entity_id').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_team_id_idx').on(table.teamId),
    index('audit_events_actor_id_idx').on(table.actorId),
    index('audit_events_action_idx').on(table.action),
    index('audit_events_entity_id_idx').on(table.entityId),
    index('audit_events_created_at_idx').on(table.createdAt),
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
export const candidates = pgTable(
  'candidates',
  {
    /** Unique candidate identifier (e.g., candidate_abc123) */
    id: text('id').primaryKey(),
    /** Source type: 'trap' or 'skill' */
    sourceType: text('source_type').notNull(),
    /** User who submitted this candidate */
    submittedByUserId: text('submitted_by_user_id').notNull(),
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
  },
  (table) => [
    index('idx_candidates_status').on(table.status),
    index('idx_candidates_team').on(table.teamId),
    index('idx_candidates_source_type').on(table.sourceType),
    check('ck_candidates_source_type', sql`${table.sourceType} IN ('trap', 'skill')`),
    check(
      'ck_candidates_status',
      sql`${table.status} IN ('received', 'queued', 'analyzing', 'duplicate_detected', 'ready_for_review', 'resolved', 'error')`,
    ),
  ],
);

// =============================================================================
// Candidate Domain Sub-Tables (Round 5: Structural Refactoring)
// =============================================================================

/**
 * Structured analysis results for candidate submissions.
 * Replaces JSONB analysis_snapshot column for queryable, indexable analysis data.
 */
export const candidateAnalyses = pgTable(
  'candidate_analyses',
  {
    /** Reference to parent candidate (1:1 relationship) */
    candidateId: text('candidate_id').primaryKey(),
    /** When normalization was performed */
    normalizedAt: timestamp('normalized_at', { withTimezone: true }).notNull(),
    /** SHA-256 hash of normalized content */
    fingerprint: text('fingerprint').notNull(),
    /** Keywords extracted from content */
    keywords: jsonb('keywords').notNull().$type<string[]>().default([]),
    /** Tokens extracted from content for similarity matching */
    tokens: jsonb('tokens').notNull().$type<string[]>().default([]),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_candidate_analyses_fingerprint').on(table.fingerprint)],
);

/**
 * Duplicate case master table.
 * Replaces JSONB duplicate_case column on candidates table.
 * Each row represents a duplicate detection run for one candidate.
 */
export const candidateDuplicateCases = pgTable(
  'candidate_duplicate_cases',
  {
    /** Unique case identifier */
    id: text('id').primaryKey(),
    /** Reference to parent candidate */
    candidateId: text('candidate_id').notNull(),
    /** When duplicates were detected */
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
    /** Algorithm version used for detection */
    detectionVersion: text('detection_version').notNull(),
    /** Highest similarity score across all matches */
    highestSimilarity: real('highest_similarity').notNull(),
    /** True if any match is an exact duplicate */
    hasExactDuplicate: integer('has_exact_duplicate').notNull().default(0),
    /** Classification of duplicate severity */
    duplicateType: text('duplicate_type').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_candidate_duplicate_cases_candidate').on(table.candidateId),
    index('idx_candidate_duplicate_cases_type').on(table.duplicateType),
    check(
      'ck_candidate_duplicate_cases_type',
      sql`${table.duplicateType} IN ('exact', 'semantic', 'none')`,
    ),
  ],
);

/**
 * Duplicate match detail rows.
 * Each row is one matched entity within a duplicate case.
 * Replaces the nested matches[] array inside JSONB duplicate_case.
 */
export const candidateDuplicateMatches = pgTable(
  'candidate_duplicate_matches',
  {
    /** Internal primary key */
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    /** Reference to parent duplicate case */
    duplicateCaseId: text('duplicate_case_id').notNull(),
    /** Type of the matched entity */
    entityType: text('entity_type').notNull(),
    /** ID of the matched entity */
    entityId: text('entity_id').notNull(),
    /** Title of the matched entity for display */
    entityTitle: text('entity_title').notNull(),
    /** Similarity score (0.0-1.0 as real) */
    similarityScore: real('similarity_score').notNull(),
    /** Classification of match confidence */
    matchType: text('match_type').notNull(),
    /** Keywords shared between candidate and match */
    sharedKeywords: jsonb('shared_keywords').notNull().$type<string[]>().default([]),
    /** Tokens shared between candidate and match */
    sharedTokens: jsonb('shared_tokens').notNull().$type<string[]>().default([]),
    /** Text overlap percentage (0-100) */
    textOverlapPercent: integer('text_overlap_percent').notNull().default(0),
  },
  (table) => [
    index('idx_candidate_duplicate_matches_case').on(table.duplicateCaseId),
    index('idx_candidate_duplicate_matches_entity').on(table.entityType, table.entityId),
    check(
      'ck_candidate_duplicate_matches_entity_type',
      sql`${table.entityType} IN ('trap', 'skill')`,
    ),
    check(
      'ck_candidate_duplicate_matches_match_type',
      sql`${table.matchType} IN ('exact', 'high-overlap', 'semantic-similar')`,
    ),
  ],
);

/**
 * Manual review results for candidate submissions.
 * Replaces JSONB manual_result column on candidates table.
 */
export const candidateManualResults = pgTable(
  'candidate_manual_results',
  {
    /** Reference to parent candidate (1:1 relationship) */
    candidateId: text('candidate_id').primaryKey(),
    /** Review decision */
    decision: text('decision').notNull(),
    /** Reviewer notes */
    notes: text('notes').notNull(),
    /** Merge target entity type (null if decision is 'independent') */
    mergedWithEntityType: text('merged_with_entity_type'),
    /** Merge target entity ID (null if decision is 'independent') */
    mergedWithEntityId: text('merged_with_entity_id'),
    /** Merge target entity title (null if decision is 'independent') */
    mergedWithEntityTitle: text('merged_with_entity_title'),
    /** When the review was submitted */
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    /** User who submitted the review */
    submittedByUserId: text('submitted_by_user_id').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'ck_candidate_manual_results_decision',
      sql`${table.decision} IN ('independent', 'merged')`,
    ),
  ],
);

/**
 * Resolution outcomes for candidate submissions.
 * Records what action was taken when a manual result was applied.
 */
export const candidateResolutionOutcomes = pgTable(
  'candidate_resolution_outcomes',
  {
    /** Reference to parent candidate (1:1 relationship) */
    candidateId: text('candidate_id').primaryKey(),
    /** The decision that was applied */
    decision: text('decision').notNull(),
    /** For 'independent': ID of the newly created entity */
    publishedEntityId: text('published_entity_id'),
    /** For 'merged': ID of the existing entity that absorbed the candidate */
    mergedIntoEntityId: text('merged_into_entity_id'),
    /** Type of the affected entity */
    entityType: text('entity_type'),
    /** When the resolution was applied */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull(),
    /** User who applied the resolution */
    resolvedBy: text('resolved_by').notNull(),
    /** Notes from the manual result */
    notes: text('notes').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'ck_candidate_resolution_outcomes_decision',
      sql`${table.decision} IN ('independent', 'merged')`,
    ),
  ],
);

/**
 * Entity lineage records for tracking provenance.
 * Links candidates to their final published or merged outcomes.
 * Replaces in-memory-only entityLineage array in store_snapshot.
 */
export const entityLineage = pgTable(
  'entity_lineage',
  {
    /** Unique lineage record identifier */
    id: text('id').primaryKey(),
    /** Source candidate ID */
    candidateId: text('candidate_id').notNull(),
    /** Type of lineage relationship */
    relationshipType: text('relationship_type').notNull(),
    /** Source entity type */
    sourceType: text('source_type').notNull(),
    /** Source entity ID */
    sourceId: text('source_id').notNull(),
    /** Target entity type */
    targetType: text('target_type').notNull(),
    /** Target entity ID */
    targetId: text('target_id').notNull(),
    /** When this lineage was recorded */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** Notes explaining the relationship */
    notes: text('notes'),
  },
  (table) => [
    index('idx_entity_lineage_candidate').on(table.candidateId),
    index('idx_entity_lineage_source').on(table.sourceType, table.sourceId),
    index('idx_entity_lineage_target').on(table.targetType, table.targetId),
    check(
      'ck_entity_lineage_relationship_type',
      sql`${table.relationshipType} IN ('published_as', 'merged_into')`,
    ),
    check(
      'ck_entity_lineage_source_type',
      sql`${table.sourceType} IN ('candidate', 'trap', 'skill')`,
    ),
    check('ck_entity_lineage_target_type', sql`${table.targetType} IN ('trap', 'skill')`),
  ],
);

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
 * SEQUENCE for skill artifact ID generation.
 * Provides monotonic ID values for skill_artifacts table.
 */
export const skillArtifactIdSeq = pgSequence('skill_artifact_id_seq', {
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
    maintenanceMeta: jsonb('maintenance_meta').$type<{
      maintainerUserId: string | null;
      maintainerHandle: string | null;
      maintainerLevel: number | null;
      reviewBy: string | null;
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
// Skill Artifact Tables (Phase 63: WRITE-03)
// =============================================================================

/**
 * Skill artifacts table for row-level storage of skill artifact data.
 * Each row represents a single skill artifact with its current state.
 * Enables row-level locking and concurrent access without blocking other artifacts.
 */
export const skillArtifacts = pgTable(
  'skill_artifacts',
  {
    /** Unique artifact identifier (e.g., artifact_123) */
    id: text('id').primaryKey(),
    /** Team ID if team-scoped, null for global */
    teamId: text('team_id'),
    /** Scope: 'global' or 'project' */
    scope: text('scope').notNull(),
    /** Labels for filtering and categorization */
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    /** Human-readable title */
    title: text('title').notNull(),
    /** URL-friendly slug for references */
    slug: text('slug').notNull(),
    /** Required security level for access control */
    requiredLevel: integer('required_level').notNull().default(0),
    /** Current lifecycle state */
    lifecycleState: text('lifecycle_state').notNull().$type<LifecycleState>(),
    /** Owner/creator user ID */
    ownerUserId: text('owner_user_id').notNull(),
    /** Artifact-specific metadata */
    metadata: jsonb('metadata').notNull().$type<{
      sourceKind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
      submissionCount: number;
      resubmissionCount: number;
      revisionCount: number;
      latestSubmissionId: string | null;
      latestSubmittedAt: string | null;
      latestReviewedAt: string | null;
      latestDecision: 'approve' | 'reject' | null;
    }>(),
    /** Agent review result (if applicable) */
    agentReview: jsonb('agent_review').$type<{
      status: 'agent-pass' | 'agent-rejected';
      duplicateRisk: 'low' | 'medium' | 'high';
      correctnessRisk: 'low' | 'medium' | 'high';
      completenessRisk: 'low' | 'medium' | 'high';
      checkedAt: string;
      notes: string[];
    } | null>(),
    /** Maintenance metadata for ownership and review-due tracking */
    maintenanceMeta: jsonb('maintenance_meta').$type<{
      maintainerUserId: string | null;
      maintainerHandle: string | null;
      maintainerLevel: number | null;
      reviewBy: string | null;
    } | null>(),
    /** Boundary constraints for artifact applicability */
    boundary: jsonb('boundary').$type<Boundary | null>(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifacts_lifecycle_state').on(table.lifecycleState),
    index('idx_skill_artifacts_team').on(table.teamId),
    index('idx_skill_artifacts_slug').on(table.slug),
    uniqueIndex('idx_skill_artifacts_scope_team_slug').on(
      sql`COALESCE(${table.teamId}, '__global__')`,
      table.scope,
      table.slug,
    ),
  ],
);

/**
 * Artifact revisions table for immutable revision history.
 * Each row captures a snapshot of artifact files and derived outputs at a point in time.
 */
export const artifactRevisions = pgTable(
  'artifact_revisions',
  {
    /** Composite key: {artifact_id}_rev{revision} */
    id: text('id').primaryKey(),
    /** Reference to parent skill artifact */
    artifactId: text('artifact_id').notNull(),
    /** Monotonically increasing revision number */
    revisionNo: integer('revision_no').notNull(),
    /** SHA-256 hash of all source files for this revision */
    sourceHash: text('source_hash').notNull(),
    /** All files in the skill directory at this revision */
    files: jsonb('files').notNull().$type<
      Array<{
        path: string;
        kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
        sha256: string;
        sizeBytes: number;
        mediaType: string;
        source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
        includeInDerivation: boolean;
        activationOnly: boolean;
      }>
    >(),
    /** Script descriptors for executable scripts in this revision */
    scriptDescriptors: jsonb('script_descriptors').notNull().$type<
      Array<{
        path: string;
        sha256: string;
        capability: string;
        argsSchemaSummary: string;
        sideEffectSummary: string;
        defaultPolicy: string;
      }>
    >(),
    /** Cached derived outputs keyed by source hash */
    derived: jsonb('derived').$type<{
      profile: {
        artifactId: string;
        revision: number;
        sourceHash: string;
        title: string;
        summary: string;
        keywords: string[];
        referencePaths: string[];
        contentHash: string;
      } | null;
      capsules: Array<{
        capsuleId: string;
        artifactId: string;
        revision: number;
        sourcePaths: string[];
        content: string;
        situation: string;
        problem: string;
        goal: string;
        errorText: string | null;
        labels: string[];
        scope: string;
        requiredLevel: number;
      }>;
      clientManifest: {
        artifactId: string;
        revision: number;
        references: Array<{
          path: string;
          sha256: string;
          sizeBytes: number;
          mediaType: string;
        }>;
        assets: Array<{
          path: string;
          sha256: string;
          sizeBytes: number;
          mediaType: string;
        }>;
        scripts: Array<{
          path: string;
          sha256: string;
          capability: string;
          argsSchemaSummary: string;
          sideEffectSummary: string;
          defaultPolicy: string;
        }>;
        sourceHash: string;
      } | null;
      sourceHash: string;
      derivedAt: string;
    } | null>(),
    /** When this revision was submitted */
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    /** User who submitted this revision */
    submittedByUserId: text('submitted_by_user_id').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_artifact_revisions_artifact').on(table.artifactId),
    uniqueIndex('idx_artifact_revisions_artifact_revision_no').on(
      table.artifactId,
      table.revisionNo,
    ),
  ],
);

export const skillArtifactFiles = pgTable(
  'skill_artifact_files',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    path: text('path').notNull(),
    kind: text('kind').notNull().$type<'skill-markdown' | 'reference' | 'asset' | 'script'>(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mediaType: text('media_type').notNull(),
    sourceGroup: text('source_group')
      .notNull()
      .$type<'references/' | 'assets/' | 'scripts/' | 'SKILL.md'>(),
    includeInDerivation: integer('include_in_derivation').notNull().default(1),
    activationOnly: integer('activation_only').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_files_artifact_revision').on(table.artifactRevisionId),
    index('idx_skill_artifact_files_artifact').on(table.artifactId, table.revisionNo),
    uniqueIndex('idx_skill_artifact_files_revision_path').on(table.artifactRevisionId, table.path),
    check(
      'ck_skill_artifact_files_kind',
      sql`${table.kind} IN ('skill-markdown', 'reference', 'asset', 'script')`,
    ),
  ],
);

export const skillArtifactScriptDescriptors = pgTable(
  'skill_artifact_script_descriptors',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    path: text('path').notNull(),
    sha256: text('sha256').notNull(),
    capability: text('capability').notNull(),
    argsSchemaSummary: text('args_schema_summary').notNull(),
    sideEffectSummary: text('side_effect_summary').notNull(),
    defaultPolicy: text('default_policy').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_script_descriptors_revision').on(table.artifactRevisionId),
    index('idx_skill_artifact_script_descriptors_artifact').on(table.artifactId, table.revisionNo),
    uniqueIndex('idx_skill_artifact_script_descriptors_revision_path').on(
      table.artifactRevisionId,
      table.path,
    ),
  ],
);

export const skillArtifactProfiles = pgTable(
  'skill_artifact_profiles',
  {
    artifactRevisionId: text('artifact_revision_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    sourceHash: text('source_hash').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    keywords: jsonb('keywords').notNull().$type<string[]>().default([]),
    referencePaths: jsonb('reference_paths').notNull().$type<string[]>().default([]),
    contentHash: text('content_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_skill_artifact_profiles_artifact').on(table.artifactId, table.revisionNo)],
);

export const skillArtifactCapsules = pgTable(
  'skill_artifact_capsules',
  {
    capsuleId: text('capsule_id').primaryKey(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    sourceHash: text('source_hash').notNull(),
    sourcePaths: jsonb('source_paths').notNull().$type<string[]>().default([]),
    content: text('content').notNull(),
    situation: text('situation').notNull(),
    problem: text('problem').notNull(),
    goal: text('goal').notNull(),
    errorText: text('error_text'),
    contextualPrefix: text('contextual_prefix'),
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    scope: text('scope').notNull().$type<Scope>(),
    requiredLevel: integer('required_level').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_capsules_revision').on(table.artifactRevisionId),
    index('idx_skill_artifact_capsules_artifact').on(table.artifactId, table.revisionNo),
    check('ck_skill_artifact_capsules_scope', sql`${table.scope} IN ('global', 'project')`),
  ],
);

/**
 * Capsule keyword tokens for PostgreSQL lexical search.
 * Derived index table — stores tokenized capsule field content for fast keyword recall.
 * Uses GIN-indexed text[] arrays with && (overlap) operator for efficient matching.
 *
 * Fields tokenized: content, situation, problem, goal, labels, contextualPrefix
 * Governance columns (teamId, scope, requiredLevel) mirror capsules for WHERE filtering.
 */
export const skillArtifactCapsuleKeywords = pgTable(
  'skill_artifact_capsule_keywords',
  {
    capsuleId: text('capsule_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    teamId: text('team_id'),
    scope: text('scope').notNull().$type<Scope>(),
    requiredLevel: integer('required_level').notNull(),
    status: text('status').notNull().default('synced'),
    tokens: text('tokens').array().notNull().default([]),
    fieldTokensContent: text('field_tokens_content').array().notNull().default([]),
    fieldTokensSituation: text('field_tokens_situation').array().notNull().default([]),
    fieldTokensProblem: text('field_tokens_problem').array().notNull().default([]),
    fieldTokensGoal: text('field_tokens_goal').array().notNull().default([]),
    fieldTokensLabels: text('field_tokens_labels').array().notNull().default([]),
    fieldTokensContextualPrefix: text('field_tokens_contextual_prefix')
      .array()
      .notNull()
      .default([]),
    contentHash: text('content_hash').notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_capsule_keywords_artifact_revision').on(table.artifactId, table.revisionNo),
    index('idx_capsule_keywords_tokens_gin').using('gin', table.tokens),
    index('idx_capsule_keywords_status').on(table.status),
    check('ck_skill_artifact_capsule_keywords_scope', sql`${table.scope} IN ('global', 'project')`),
  ],
);

/**
 * Capsule embedding vectors for PostgreSQL semantic search.
 * Derived index table — stores pre-computed embedding vectors for fast cosine similarity search.
 * Uses pgvector HNSW index for O(log n) approximate nearest neighbor search.
 *
 * Embedding text built from: labels → situation → problem → goal → contextualPrefix → content
 * Governance columns (teamId, scope, requiredLevel) mirror capsules for WHERE filtering.
 *
 * The HNSW vector index is not defined here as Drizzle ORM doesn't natively support
 * custom index types. The index is created programmatically via
 * ensureCapsuleVectorIndex() in the PG capsule vector repository.
 */
export const skillArtifactCapsuleEmbeddings = pgTable(
  'skill_artifact_capsule_embeddings',
  {
    capsuleId: text('capsule_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    teamId: text('team_id'),
    scope: text('scope').notNull().$type<Scope>(),
    requiredLevel: integer('required_level').notNull(),
    status: text('status').notNull().default('synced'),
    embedding: vector('embedding', { dimensions: 384 }).notNull(),
    contentHash: text('content_hash').notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_capsule_embeddings_artifact_revision').on(table.artifactId, table.revisionNo),
    index('idx_capsule_embeddings_status').on(table.status),
    check(
      'ck_skill_artifact_capsule_embeddings_scope',
      sql`${table.scope} IN ('global', 'project')`,
    ),
  ],
);

export const skillArtifactClientManifests = pgTable(
  'skill_artifact_client_manifests',
  {
    artifactRevisionId: text('artifact_revision_id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    sourceHash: text('source_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_client_manifests_artifact').on(table.artifactId, table.revisionNo),
  ],
);

export const skillArtifactManifestReferences = pgTable(
  'skill_artifact_manifest_references',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    path: text('path').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mediaType: text('media_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_manifest_references_revision').on(table.artifactRevisionId),
    uniqueIndex('idx_skill_artifact_manifest_references_revision_path').on(
      table.artifactRevisionId,
      table.path,
    ),
  ],
);

export const skillArtifactManifestAssets = pgTable(
  'skill_artifact_manifest_assets',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    path: text('path').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    mediaType: text('media_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_manifest_assets_revision').on(table.artifactRevisionId),
    uniqueIndex('idx_skill_artifact_manifest_assets_revision_path').on(
      table.artifactRevisionId,
      table.path,
    ),
  ],
);

export const skillArtifactManifestScripts = pgTable(
  'skill_artifact_manifest_scripts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactRevisionId: text('artifact_revision_id').notNull(),
    path: text('path').notNull(),
    sha256: text('sha256').notNull(),
    capability: text('capability').notNull(),
    argsSchemaSummary: text('args_schema_summary').notNull(),
    sideEffectSummary: text('side_effect_summary').notNull(),
    defaultPolicy: text('default_policy').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_manifest_scripts_revision').on(table.artifactRevisionId),
    uniqueIndex('idx_skill_artifact_manifest_scripts_revision_path').on(
      table.artifactRevisionId,
      table.path,
    ),
  ],
);

export const skillArtifactBoundaryContexts = pgTable(
  'skill_artifact_boundary_contexts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactId: text('artifact_id').notNull(),
    contextValue: text('context_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_boundary_contexts_artifact').on(table.artifactId),
    uniqueIndex('idx_skill_artifact_boundary_contexts_artifact_value').on(
      table.artifactId,
      table.contextValue,
    ),
  ],
);

export const skillArtifactBoundaryVersions = pgTable(
  'skill_artifact_boundary_versions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactId: text('artifact_id').notNull(),
    packageName: text('package_name').notNull(),
    rangeValue: text('range_value').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_skill_artifact_boundary_versions_artifact').on(table.artifactId)],
);

export const skillArtifactBoundaryPrerequisites = pgTable(
  'skill_artifact_boundary_prerequisites',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactId: text('artifact_id').notNull(),
    description: text('description').notNull(),
    kind: text('kind'),
    required: integer('required').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_skill_artifact_boundary_prerequisites_artifact').on(table.artifactId)],
);

export const skillArtifactBoundarySignals = pgTable(
  'skill_artifact_boundary_signals',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactId: text('artifact_id').notNull(),
    pattern: text('pattern').notNull(),
    kind: text('kind').notNull().default('keyword'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_skill_artifact_boundary_signals_artifact').on(table.artifactId)],
);

export const skillArtifactBoundaryExclusions = pgTable(
  'skill_artifact_boundary_exclusions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactId: text('artifact_id').notNull(),
    description: text('description').notNull(),
    kind: text('kind'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_skill_artifact_boundary_exclusions_artifact').on(table.artifactId)],
);

export const skillArtifactBoundaryEvidence = pgTable(
  'skill_artifact_boundary_evidence',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    artifactId: text('artifact_id').notNull(),
    kind: text('kind').notNull(),
    identifier: text('identifier').notNull(),
    url: text('url'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_skill_artifact_boundary_evidence_artifact').on(table.artifactId)],
);

export const skillArtifactMaintenanceAssignments = pgTable(
  'skill_artifact_maintenance_assignments',
  {
    artifactId: text('artifact_id').primaryKey(),
    maintainerUserId: text('maintainer_user_id'),
    maintainerHandle: text('maintainer_handle'),
    maintainerLevel: integer('maintainer_level'),
    reviewBy: timestamp('review_by', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_maintenance_assignments_maintainer').on(table.maintainerUserId),
    index('idx_skill_artifact_maintenance_assignments_review_by').on(table.reviewBy),
  ],
);

export const skillArtifactAgentReviews = pgTable(
  'skill_artifact_agent_reviews',
  {
    artifactId: text('artifact_id').primaryKey(),
    status: text('status').notNull(),
    duplicateRisk: text('duplicate_risk').notNull(),
    correctnessRisk: text('correctness_risk').notNull(),
    completenessRisk: text('completeness_risk').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
    notes: jsonb('notes').notNull().$type<string[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_agent_reviews_status').on(table.status),
    check(
      'ck_skill_artifact_agent_reviews_status',
      sql`${table.status} IN ('agent-pass', 'agent-rejected')`,
    ),
    check(
      'ck_skill_artifact_agent_reviews_duplicate_risk',
      sql`${table.duplicateRisk} IN ('low', 'medium', 'high')`,
    ),
    check(
      'ck_skill_artifact_agent_reviews_correctness_risk',
      sql`${table.correctnessRisk} IN ('low', 'medium', 'high')`,
    ),
    check(
      'ck_skill_artifact_agent_reviews_completeness_risk',
      sql`${table.completenessRisk} IN ('low', 'medium', 'high')`,
    ),
  ],
);

export const skillArtifactMetadataTable = pgTable(
  'skill_artifact_metadata',
  {
    artifactId: text('artifact_id').primaryKey(),
    sourceKind: text('source_kind').notNull(),
    submissionCount: integer('submission_count').notNull().default(0),
    resubmissionCount: integer('resubmission_count').notNull().default(0),
    revisionCount: integer('revision_count').notNull().default(0),
    latestSubmissionId: text('latest_submission_id'),
    latestSubmittedAt: timestamp('latest_submitted_at', { withTimezone: true }),
    latestReviewedAt: timestamp('latest_reviewed_at', { withTimezone: true }),
    latestDecision: text('latest_decision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifact_metadata_source_kind').on(table.sourceKind),
    check(
      'ck_skill_artifact_metadata_source_kind',
      sql`${table.sourceKind} IN ('skill-directory', 'single-skill-md', 'legacy-knowledge')`,
    ),
    check(
      'ck_skill_artifact_metadata_latest_decision',
      sql`${table.latestDecision} IS NULL OR ${table.latestDecision} IN ('approve', 'reject')`,
    ),
  ],
);

/**
 * Artifact lifecycle events table for audit trail of state transitions.
 * Each row records a state change with actor and context.
 */
export const artifactLifecycleEvents = pgTable(
  'artifact_lifecycle_events',
  {
    /** Unique event identifier */
    id: text('id').primaryKey(),
    /** Reference to parent skill artifact */
    artifactId: text('artifact_id').notNull(),
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
  (table) => [index('idx_artifact_lifecycle_events_artifact').on(table.artifactId)],
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
// Task Queue Table
// =============================================================================

/**
 * Durable task queue backed by PostgreSQL SKIP LOCKED.
 *
 * Dequeue partial index (defined in migration 0009):
 *   CREATE INDEX task_queue_pending_dequeue_idx
 *   ON task_queue (type, process_after, priority DESC, created_at ASC)
 *   WHERE status = 'pending';
 *
 * Deduplication guard (defined in migration 0009):
 *   CREATE UNIQUE INDEX task_queue_dedupe_pending_idx
 *   ON task_queue (type, dedupe_key)
 *   WHERE status IN ('pending', 'running');
 */
export const taskQueue = pgTable(
  'task_queue',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    payload: text('payload').notNull(),
    status: text('status').notNull().default('pending'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    /** Opaque key for idempotent enqueue — prevents duplicate (type, key) pairs */
    dedupeKey: text('dedupe_key'),
    processAfter: timestamp('process_after', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [index('task_queue_type_dedupe_idx').on(table.type, table.dedupeKey)],
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
