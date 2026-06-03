/**
 * Candidate pipeline domain tables.
 *
 * Covers: candidates, analyses, duplicate cases/matches,
 * manual results, resolution outcomes, and entity lineage.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';

import type { AnalysisSnapshot, CandidatePayload, DuplicateCase } from '@trapmap/contracts';

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
    /** Duplicate-path trace metadata for review/debugging */
    duplicateTrace: jsonb('duplicate_trace').$type<AnalysisSnapshot['duplicateTrace'] | null>(),
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
