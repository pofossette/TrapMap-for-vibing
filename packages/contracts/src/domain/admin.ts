/**
 * Admin-specific schemas for system administration endpoints.
 *
 * These schemas support admin-only operations that require elevated privileges.
 */

import { z } from 'zod';
import { entityIdSchema, scopeSchema, labelSchema } from './common.js';
import { boundarySchema } from './boundary.js';

/**
 * Query schema for admin boundary search.
 *
 * Allows searching knowledge entries by boundary constraints:
 * - context: Situational context label (e.g., 'production', 'frontend')
 * - platform: Platform constraint (e.g., 'linux', 'windows')
 * - package: Package name constraint (e.g., 'react', 'typescript')
 */
export const adminBoundarySearchQuerySchema = z.object({
  /** Context label to match (e.g., 'production', 'frontend') */
  context: z.string().min(1).max(64).optional(),
  /** Platform to match (e.g., 'linux', 'windows') */
  platform: z.string().min(1).max(64).optional(),
  /** Package name to match (e.g., 'react', 'typescript') */
  package: z.string().min(1).max(128).optional(),
  /** Maximum results to return */
  maxResults: z.number().int().min(1).max(100).default(50),
});

/**
 * Match result for admin boundary search.
 *
 * Contains a summary of a knowledge entry that matched the search criteria,
 * including its boundary information for inspection.
 */
export const adminBoundarySearchMatchSchema = z.object({
  entryId: entityIdSchema,
  scope: scopeSchema,
  shortcut: z.string(),
  detail: z.string(),
  labels: z.array(labelSchema),
  /** The entry's boundary (if any) */
  boundary: boundarySchema.nullable(),
});

/**
 * Response schema for admin boundary search.
 */
export const adminBoundarySearchResponseSchema = z.object({
  matches: z.array(adminBoundarySearchMatchSchema),
  query: adminBoundarySearchQuerySchema,
});

export type AdminBoundarySearchQuery = z.infer<typeof adminBoundarySearchQuerySchema>;
export type AdminBoundarySearchMatch = z.infer<typeof adminBoundarySearchMatchSchema>;
export type AdminBoundarySearchResponse = z.infer<typeof adminBoundarySearchResponseSchema>;
