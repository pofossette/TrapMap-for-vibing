/**
 * Shared retrieval index domain tables.
 *
 * Covers: graph index documents for GraphRAG-lite persistence.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { auditTimestamps } from './column-factories.js';

/**
 * Graph index documents for GraphRAG-lite persistence.
 * Derived index table -- not a source of business truth.
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
          rawLabel?: string;
          canonicalLabelId?: string;
          alignmentDecision?: string;
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
    ...auditTimestamps(),
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

/**
 * Durable badcase trace records for retrieval/summary reproducibility.
 * Separate from usage analytics so operators can inspect failures even when
 * analytics retention or rollups change.
 */
export const retrievalBadcaseTraces = pgTable(
  'retrieval_badcase_traces',
  {
    id: text('id').primaryKey(),
    feedbackId: text('feedback_id').notNull(),
    queryId: text('query_id'),
    querySeed: text('query_seed'),
    routeFamily: text('route_family'),
    entryId: text('entry_id').notNull(),
    entryType: text('entry_type').notNull(),
    failureClassification: text('failure_classification'),
    expectedCorrection: text('expected_correction'),
    selectedResultSnapshot: jsonb('selected_result_snapshot'),
    ...auditTimestamps(),
  },
  (table) => [
    index('idx_retrieval_badcase_query').on(table.queryId),
    index('idx_retrieval_badcase_feedback').on(table.feedbackId),
    index('idx_retrieval_badcase_entry').on(table.entryId, table.entryType),
    check('ck_retrieval_badcase_entry_type', sql`${table.entryType} IN ('trap', 'skill')`),
    check(
      'ck_retrieval_badcase_route_family',
      sql`${table.routeFamily} IS NULL OR ${table.routeFamily} IN ('entry', 'capsule', 'graph-plan')`,
    ),
  ],
);
