import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from './common.js';

/**
 * Conflict type enum for knowledge entry relationships.
 * Classifies how two entries with similar problems relate to each other.
 */
/** @internal Schema not directly imported by server or CLI — type ConflictType IS used. */
export const conflictTypeSchema = z.enum([
  'alternative', // Different valid approaches (e.g., REST vs GraphQL)
  'contradictory', // Directly opposing solutions (e.g., "use X" vs "avoid X")
  'superseded', // Newer entry replaces older approach
]);

/**
 * Conflict record schema for storage.
 * Persists detected conflicts between knowledge entries for retrieval enrichment.
 */
export const conflictRelationSchema = z.object({
  /** Unique conflict relation identifier */
  id: entityIdSchema,
  /** First entry ID in the conflict (lower ID for canonical ordering) */
  entryIdA: entityIdSchema,
  /** Second entry ID in the conflict (higher ID for canonical ordering) */
  entryIdB: entityIdSchema,
  /** Classification of the conflict relationship */
  conflictType: conflictTypeSchema,
  /** Human-readable context explaining the conflict */
  context: z.string().min(1).max(500),
  /** Token overlap score for problem/solution comparison (0-1) */
  problemOverlapScore: z.number().min(0).max(1),
  /** Token difference score for solution divergence (0-1) */
  solutionDiffScore: z.number().min(0).max(1),
  /** When this conflict was detected */
  detectedAt: isoTimestampSchema,
});

/**
 * Conflict hint schema for retrieval responses.
 * Compact form excludes scores, includes only display-relevant fields.
 * Used to show users conflicting entries without verbose metadata.
 */
export const conflictHintSchema = z.object({
  /** ID of the conflicting entry */
  entryId: entityIdSchema,
  /** Shortcut/title of the conflicting entry for display */
  shortcut: z.string(),
  /** Classification of the conflict relationship */
  conflictType: conflictTypeSchema,
  /** Human-readable context explaining the conflict */
  context: z.string(),
});

// Type exports
export type ConflictType = z.infer<typeof conflictTypeSchema>;
export type ConflictRelation = z.infer<typeof conflictRelationSchema>;
export type ConflictHint = z.infer<typeof conflictHintSchema>;
