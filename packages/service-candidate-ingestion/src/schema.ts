import type { AnalysisSnapshot, CandidatePayload, DuplicateCase } from '@trapmap/contracts';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';

const auditTimestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const candidates = pgTable(
  'candidates',
  {
    id: text('id').primaryKey(),
    sourceType: text('source_type').notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    teamId: text('team_id'),
    status: text('status').notNull(),
    originalPayload: jsonb('original_payload').notNull().$type<CandidatePayload>(),
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
    check('ck_candidates_source_type', sql`${table.sourceType} IN ('trap', 'skill')`),
    check(
      'ck_candidates_status',
      sql`${table.status} IN ('received', 'queued', 'analyzing', 'duplicate_detected', 'ready_for_review', 'resolved', 'error')`,
    ),
  ],
);

export const candidateAnalyses = pgTable(
  'candidate_analyses',
  {
    candidateId: text('candidate_id').primaryKey(),
    normalizedAt: timestamp('normalized_at', { withTimezone: true }).notNull(),
    fingerprint: text('fingerprint').notNull(),
    keywords: jsonb('keywords').notNull().$type<string[]>().default([]),
    tokens: jsonb('tokens').notNull().$type<string[]>().default([]),
    duplicateTrace: jsonb('duplicate_trace').$type<AnalysisSnapshot['duplicateTrace'] | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_candidate_analyses_fingerprint').on(table.fingerprint)],
);

export const candidateDuplicateCases = pgTable(
  'candidate_duplicate_cases',
  {
    id: text('id').primaryKey(),
    candidateId: text('candidate_id').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
    detectionVersion: text('detection_version').notNull(),
    highestSimilarity: real('highest_similarity').notNull(),
    hasExactDuplicate: integer('has_exact_duplicate').notNull().default(0),
    duplicateType: text('duplicate_type').notNull(),
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

export const candidateDuplicateMatches = pgTable(
  'candidate_duplicate_matches',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    duplicateCaseId: text('duplicate_case_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    entityTitle: text('entity_title').notNull(),
    similarityScore: real('similarity_score').notNull(),
    matchType: text('match_type').notNull(),
    sharedKeywords: jsonb('shared_keywords').notNull().$type<string[]>().default([]),
    sharedTokens: jsonb('shared_tokens').notNull().$type<string[]>().default([]),
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

export const candidateManualResults = pgTable(
  'candidate_manual_results',
  {
    candidateId: text('candidate_id').primaryKey(),
    decision: text('decision').notNull(),
    notes: text('notes').notNull(),
    mergedWithEntityType: text('merged_with_entity_type'),
    mergedWithEntityId: text('merged_with_entity_id'),
    mergedWithEntityTitle: text('merged_with_entity_title'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'ck_candidate_manual_results_decision',
      sql`${table.decision} IN ('independent', 'merged')`,
    ),
  ],
);

export const candidateResolutionOutcomes = pgTable(
  'candidate_resolution_outcomes',
  {
    candidateId: text('candidate_id').primaryKey(),
    decision: text('decision').notNull(),
    publishedEntityId: text('published_entity_id'),
    mergedIntoEntityId: text('merged_into_entity_id'),
    entityType: text('entity_type'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull(),
    resolvedBy: text('resolved_by').notNull(),
    notes: text('notes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'ck_candidate_resolution_outcomes_decision',
      sql`${table.decision} IN ('independent', 'merged')`,
    ),
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
