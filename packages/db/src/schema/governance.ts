/**
 * Governance-review owned tables.
 *
 * `conflict_relations` is the durable half of the conflict-detection workflow:
 * `detectConflicts` (`packages/service-governance-review/src/conflict-workflow.ts`)
 * upserts a row per entry pair, the retrieval projection reads it back to
 * decorate search results with conflict hints, and the admin surface reads it
 * by id.
 *
 * It was the last table the applied DDL had but the models did not: the
 * pre-Phase-2 migration owned it outside `packages/db` and the compressed
 * models never picked it up, so `check:schema-parity` carried it as a
 * documented exception. Modelling it here restores the single source —
 * `check:table-schema` (models vs docs) and `check:schema-parity` (models vs
 * applied DDL) now cover it like every other table.
 */

import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const conflictRelations = pgTable(
  'conflict_relations',
  {
    /** Conflict relation id (`conflict_<random>`). */
    id: text('id').primaryKey(),
    /**
     * The pair is stored in canonical order (`entry_id_a < entry_id_b`) so the
     * unique index below is a real dedupe key rather than a directional one.
     */
    entryIdA: text('entry_id_a').notNull(),
    entryIdB: text('entry_id_b').notNull(),
    conflictType: text('conflict_type')
      .notNull()
      .$type<'alternative' | 'contradictory' | 'superseded'>(),
    /** Human-readable context for the pair (why they conflict). */
    context: text('context').notNull(),
    problemOverlapScore: doublePrecision('problem_overlap_score').notNull(),
    solutionDiffScore: doublePrecision('solution_diff_score').notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_conflict_relations_entry_pair').on(table.entryIdA, table.entryIdB),
    index('idx_conflict_relations_entry_a').on(table.entryIdA),
    index('idx_conflict_relations_entry_b').on(table.entryIdB),
    check('ck_conflict_relations_canonical_order', sql`${table.entryIdA} < ${table.entryIdB}`),
    check(
      'ck_conflict_relations_type',
      sql`${table.conflictType} IN ('alternative', 'contradictory', 'superseded')`,
    ),
  ],
);
