/**
 * Shared canonical label catalog domain tables.
 *
 * Covers: canonical labels, label aliases, label embeddings,
 * and label alignment events for the semantic merge pipeline.
 *
 * These tables are the authoritative source for canonical label identity.
 * The existing `knowledge_labels` and artifact `labels` remain as
 * source-facing metadata; they are NOT removed in this phase.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

// =============================================================================
// Canonical Label Catalog Tables
// =============================================================================

/**
 * Canonical labels table — the merge truth source.
 * Each row represents a unique semantic label concept.
 * Supports reversible merge via `status` + `mergedIntoLabelId`.
 */
export const canonicalLabels = pgTable(
  'canonical_labels',
  {
    /** Unique label identifier (e.g., lbl_timeout_issue) */
    id: text('id').primaryKey(),
    /** Label kind from the graph node vocabulary */
    kind: text('kind').notNull(),
    /** Canonical human-readable name (e.g., "timeout-issue") */
    canonicalName: text('canonical_name').notNull(),
    /** Normalized form of canonical name (lowercase, hyphenated) */
    normalizedName: text('normalized_name').notNull(),
    /** Optional definition or description */
    definition: text('definition'),
    /** Lifecycle status */
    status: text('status').notNull().default('active'),
    /** If merged, the target canonical label ID */
    mergedIntoLabelId: text('merged_into_label_id'),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_canonical_labels_normalized_kind').on(table.normalizedName, table.kind),
    index('idx_canonical_labels_kind').on(table.kind),
    index('idx_canonical_labels_status').on(table.status),
    index('idx_canonical_labels_merged_into').on(table.mergedIntoLabelId),
    check('ck_canonical_labels_status', sql`${table.status} IN ('active', 'merged', 'disabled')`),
  ],
);

/**
 * Label aliases table — observed raw label variants.
 * Each row maps one observed alias string to a canonical label.
 * The same canonical label may have many aliases.
 */
export const labelAliases = pgTable(
  'label_aliases',
  {
    /** Alias text as observed from source (e.g., "pod-timeout") */
    alias: text('alias').notNull(),
    /** Normalized form of alias (lowercase, hyphenated) */
    normalizedAlias: text('normalized_alias').notNull(),
    /** Foreign key to canonical_labels.id */
    canonicalLabelId: text('canonical_label_id').notNull(),
    /** How this alias was created */
    source: text('source').notNull().default('manual'),
    /** Confidence score for this alias mapping (0.0-1.0) */
    confidence: real('confidence').notNull().default(1.0),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_label_aliases_normalized').on(table.normalizedAlias),
    index('idx_label_aliases_canonical').on(table.canonicalLabelId),
    check('ck_label_aliases_source', sql`${table.source} IN ('manual', 'llm', 'backfill')`),
    check(
      'ck_label_aliases_confidence',
      sql`${table.confidence} >= 0.0 AND ${table.confidence} <= 1.0`,
    ),
  ],
);

/**
 * Canonical label embeddings — vector representation for semantic recall.
 * Each canonical label has at most one embedding row.
 * Enables embedding-similarity candidate recall for label alignment.
 */
export const canonicalLabelEmbeddings = pgTable(
  'canonical_label_embeddings',
  {
    /** Foreign key to canonical_labels.id */
    canonicalLabelId: text('canonical_label_id').primaryKey(),
    /** Embedding vector (384 dimensions, compatible with existing provider) */
    vector: vector('vector', { dimensions: 384 }).notNull(),
    /** SHA-256 hash of the text used to generate the embedding */
    contentHash: text('content_hash').notNull(),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Record update timestamp */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_canonical_label_embeddings_hash').on(table.contentHash)],
);

/**
 * Label alignment events — audit trail for alignment decisions.
 * Each row records one LLM (or manual) alignment decision.
 * `unsure` decisions land here as reviewable events, not silent merges.
 */
export const labelAlignmentEvents = pgTable(
  'label_alignment_events',
  {
    /** Unique event identifier */
    id: text('id').primaryKey(),
    /** The raw label that was being aligned */
    rawLabel: text('raw_label').notNull(),
    /** The evidence text that accompanied the raw label */
    rawEvidence: text('raw_evidence').notNull().default(''),
    /** The alignment decision */
    decision: text('decision').notNull(),
    /** The canonical label ID (for 'existing' decisions) */
    canonicalLabelId: text('canonical_label_id'),
    /** The canonical name (for 'new' decisions) */
    canonicalName: text('canonical_name'),
    /** Confidence score from the LLM (0.0-1.0) */
    confidence: real('confidence').notNull(),
    /** LLM reasoning for the decision */
    reasoning: text('reasoning').notNull().default(''),
    /** The candidate table that was presented to the LLM (JSONB) */
    candidateSnapshot: jsonb('candidate_snapshot')
      .$type<Array<{ id: string; canonicalName: string; recallReason: string }>>()
      .default([]),
    /** Source context: which pipeline triggered this alignment */
    sourceContext: text('source_context').notNull().default('extraction'),
    /** Record creation timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_label_alignment_events_raw_label').on(table.rawLabel),
    index('idx_label_alignment_events_decision').on(table.decision),
    index('idx_label_alignment_events_canonical').on(table.canonicalLabelId),
    check(
      'ck_label_alignment_events_decision',
      sql`${table.decision} IN ('existing', 'new', 'unsure')`,
    ),
    check(
      'ck_label_alignment_events_source_context',
      sql`${table.sourceContext} IN ('extraction', 'backfill', 'repair', 'manual')`,
    ),
  ],
);
