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

/**
 * Canonical citation schema for Phase 10.
 * Provides structured, auditable metadata for each retrieval match.
 */
export const retrievalCitationSchema = z.object({
  source: z.object({
    entryId: entityIdSchema,
    scope: scopeSchema,
    shortcut: z.string(),
  }),
  snippet: z.string().min(1),
  tags: z.array(labelSchema),
  recallChannels: z.array(z.enum(['semantic', 'keyword', 'graph'])).min(1),
  scores: z.object({
    semantic: z.number().min(0).max(1).nullable(),
    keyword: z.number().min(0).max(1).nullable(),
    graph: z.number().min(0).max(1).nullable(),
    preRerank: z.number().min(0).max(1),
    final: z.number().min(0).max(1),
  }),
});

export type RetrievalCitation = z.infer<typeof retrievalCitationSchema>;

/**
 * Canonical summary schema for Phase 10.
 * Optional LLM-generated or extractive summary with citations.
 */
export const retrievalSummarySchema = z.object({
  text: z.string().min(1),
  citations: z.array(retrievalCitationSchema).min(1),
});

export type RetrievalSummary = z.infer<typeof retrievalSummarySchema>;

export const retrievalQuerySchema = z.object({
  seed: z.string().min(1).max(2000),
  filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
  maxResults: z.number().int().min(1).max(50).default(10),
  includeRefinement: z.boolean().default(true),
  includeSummary: z.boolean().default(false),
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
  citation: retrievalCitationSchema.optional(),
});

export const retrievalResponseSchema = z.object({
  globalConstraints: z.array(retrievalMatchSchema),
  projectKnowledge: z.array(retrievalMatchSchema),
  refinementSummary: z.string().nullable(),
  summary: retrievalSummarySchema.nullable(),
});

export type RetrievalQuery = z.infer<typeof retrievalQuerySchema>;
export type RetrievalResponse = z.infer<typeof retrievalResponseSchema>;
