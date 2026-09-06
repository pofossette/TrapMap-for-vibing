/**
 * Shared candidate pipeline domain tables.
 *
 * Covers: candidates, duplicate cases (with matches jsonb),
 * consolidated outcomes, and entity lineage.
 * Phase 2 compression: 7→4 tables — analyses → candidates.analysis jsonb,
 * duplicate_matches → duplicate_cases.matches jsonb,
 * manual_results+resolution_outcomes → candidate_outcomes.
 */

import type { AnalysisSnapshot, CandidatePayload } from '@trapmap/contracts';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';
import { auditTimestamps } from './column-factories.js';

// =============================================================================
// Candidate Pipeline Tables (Phase 2: compressed)
// =============================================================================

export const candidates = pgTable(
  'candidates',
  {
    id: text('id').primaryKey(),
    sourceType: text('source_type').notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    teamId: text('team_id'),
    status: text('status').notNull(),
    originalPayload: jsonb('original_payload').notNull().$type<CandidatePayload>(),
    /** Consolidated analysis snapshot (was candidate_analyses 1:1) */
    analysis: jsonb('analysis').$type<AnalysisSnapshot | null>(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }),
    analyzingAt: timestamp('analyzing_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    retryCount: integer('retry_count').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_candidates_status').on(table.status),
    index('idx_candidates_team').on(table.teamId),
    index('idx_candidates_source_type').on(table.sourceType),
    // GIN for analysis fingerprint lookup (low-freq) + functional unique if needed at app layer
    index('idx_candidates_analysis_gin').using('gin', table.analysis),
    check('ck_candidates_source_type', sql`${table.sourceType} IN ('trap', 'skill')`),
    check(
      'ck_candidates_status',
      sql`${table.status} IN ('received', 'queued', 'analyzing', 'duplicate_detected', 'ready_for_review', 'resolved', 'error')`,
    ),
  ],
);

/**
 * Duplicate case with embedded matches jsonb.
 * Was candidate_duplicate_cases + candidate_duplicate_matches (1:N).
 */
export const candidateDuplicateCases = pgTable(
  'candidate_duplicate_cases',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
    detectionVersion: text('detection_version').notNull(),
    highestSimilarity: real('highest_similarity').notNull(),
    hasExactDuplicate: integer('has_exact_duplicate').notNull().default(0),
    duplicateType: text('duplicate_type').notNull().default('none'),
    /** Embedded matches (was candidate_duplicate_matches rows) */
    matches: jsonb('matches')
      .notNull()
      .$type<
        Array<{
          entityType: string;
          entityId: string;
          entityTitle: string;
          similarityScore: number;
          matchType: string;
          sharedKeywords: string[];
          sharedTokens: string[];
          textOverlapPercent: number;
        }>
      >()
      .default([]),
  },
  (table) => [
    index('idx_candidate_duplicate_cases_candidate').on(table.candidateId),
    index('idx_candidate_duplicate_cases_matches_gin').using('gin', table.matches),
    check(
      'ck_candidate_duplicate_cases_type',
      sql`${table.duplicateType} IN ('none', 'exact', 'high-overlap', 'semantic-similar')`,
    ),
  ],
);

/**
 * Consolidated manual + resolution outcomes (was candidate_manual_results + candidate_resolution_outcomes).
 * kind discriminates manual (review) vs resolution (applied).
 */
export const candidateOutcomes = pgTable(
  'candidate_outcomes',
  {
    candidateId: text('candidate_id').primaryKey(),
    kind: text('kind').notNull().$type<'manual' | 'resolution'>(),
    decision: text('decision').notNull(),
    notes: text('notes').notNull().default(''),
    // manual fields
    mergedWithEntityType: text('merged_with_entity_type'),
    mergedWithEntityId: text('merged_with_entity_id'),
    mergedWithEntityTitle: text('merged_with_entity_title'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedByUserId: text('submitted_by_user_id'),
    // resolution fields
    publishedEntityId: text('published_entity_id'),
    mergedIntoEntityId: text('merged_into_entity_id'),
    entityType: text('entity_type'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_candidate_outcomes_kind').on(table.kind),
    check('ck_candidate_outcomes_kind', sql`${table.kind} IN ('manual', 'resolution')`),
    check('ck_candidate_outcomes_decision', sql`${table.decision} IN ('independent', 'merged')`),
  ],
);

export const entityLineage = pgTable(
  'entity_lineage',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id').notNull(),
    relationshipType: text('relationship_type').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
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
