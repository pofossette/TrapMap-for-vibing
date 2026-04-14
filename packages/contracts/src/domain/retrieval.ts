import { z } from 'zod';

import { entityIdSchema, labelSchema, scopeSchema, securityLevelSchema } from './common.js';

/**
 * Query mode for retrieval requests.
 * Defines the retrieval strategy to use when searching knowledge.
 */
export const retrievalQueryModeSchema = z.enum(['semantic', 'hybrid', 'graph-assisted']);

export type RetrievalQueryMode = z.infer<typeof retrievalQueryModeSchema>;

export const retrievalFiltersSchema = z.object({
  teamId: entityIdSchema.nullable().optional(),
  labels: z.array(labelSchema).default([]),
  scopes: z.array(scopeSchema).default([]),
});

export const retrievalQuerySchema = z.object({
  seed: z.string().min(1).max(2000),
  filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
  maxResults: z.number().int().min(1).max(50).default(10),
  includeRefinement: z.boolean().default(true),
  mode: retrievalQueryModeSchema.default('semantic'),
});

export const retrievalMatchSchema = z.object({
  entryId: entityIdSchema,
  scope: scopeSchema,
  requiredLevel: securityLevelSchema,
  shortcut: z.string(),
  detail: z.string(),
  labels: z.array(labelSchema),
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
});

export const retrievalResponseSchema = z.object({
  globalConstraints: z.array(retrievalMatchSchema),
  projectKnowledge: z.array(retrievalMatchSchema),
  refinementSummary: z.string().nullable(),
});

export type RetrievalQuery = z.infer<typeof retrievalQuerySchema>;
export type RetrievalResponse = z.infer<typeof retrievalResponseSchema>;
