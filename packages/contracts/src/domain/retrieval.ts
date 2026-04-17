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

// =============================================================================
// Phase 14: Seed-Only Retrieval v2 Contracts (RETR-01, RETR-02, RETR-04, COMP-01)
// Capsule-native retrieval schemas that keep seed as the only required client input
// while returning distilled capsule-first results with governance inheritance.
// =============================================================================

/**
 * Capsule match in v2 retrieval response.
 * Extends the base SkillCapsule shape with score and reason for ranking transparency.
 * Inherits governance (scope, requiredLevel) from artifact root per T-14-01 mitigation.
 */
export const capsuleMatchSchema = z.object({
  /** Capsule identifier */
  capsuleId: entityIdSchema,
  /** Parent artifact identifier */
  artifactId: entityIdSchema,
  /** Revision number this capsule was derived from */
  revision: z.number().int().min(1),
  /** Source file paths that contributed to this capsule */
  sourcePaths: z.array(z.string().max(512)).min(1),
  /** Distilled capsule content */
  content: z.string().min(1).max(5000),
  /** Situation context */
  situation: z.string().min(1).max(1000),
  /** Problem statement */
  problem: z.string().min(1).max(1000),
  /** Goal or solution */
  goal: z.string().min(1).max(1000),
  /** Optional error text for error-specific capsules */
  errorText: z.string().max(500).optional(),
  /** Searchable labels */
  labels: z.array(labelSchema).min(1),
  /** Governance scope (inherited from artifact root) */
  scope: scopeSchema,
  /** Required security level (inherited from artifact root) */
  requiredLevel: securityLevelSchema,
  /** Final ranking score after all boosts applied */
  score: z.number().min(0).max(1),
  /** Human-readable explanation of why this capsule matched */
  reason: z.string().min(1),
});

/**
 * Profile hint in v2 retrieval response.
 * Provides lightweight artifact metadata without full profile content.
 * Used for activation hints and context assembly.
 */
export const profileHintSchema = z.object({
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Human-readable title */
  title: z.string().min(1).max(280),
  /** URL-friendly slug for references */
  slug: z.string().min(1).max(160),
  /** Searchable labels */
  labels: z.array(labelSchema).min(1),
});

/**
 * v2 retrieval query schema (RETR-01).
 * Accepts only seed as the required client input.
 * Server internally parses seed into situation/problem/goal/errorText per RETR-02.
 * Structured intent fields are NOT part of the client contract.
 */
export const retrievalV2QuerySchema = z.object({
  /** Single natural-language seed string - the only required input */
  seed: z.string().min(1).max(2000),
  /** Optional filters to narrow search scope */
  filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
  /** Maximum number of capsules to return */
  maxResults: z.number().int().min(1).max(50).default(10),
});

/**
 * v2 retrieval response schema (RETR-04, COMP-01).
 * Returns capsule-first distilled results instead of flat knowledge entries.
 * Capsules inherit governance from artifact root per T-14-01 mitigation.
 * Coexists with legacy retrievalResponseSchema for backward compatibility.
 * Optional summary consumes only already-filtered distilled hits (T-14-08).
 */
export const retrievalV2ResponseSchema = z.object({
  /** Ranked capsule matches with governance inheritance */
  capsules: z.array(capsuleMatchSchema).default([]),
  /** Lightweight artifact metadata for activation hints */
  profileHints: z.array(profileHintSchema).default([]),
  /** Optional refinement summary over filtered capsules */
  refinementSummary: z.string().nullable(),
  /** Optional summary over filtered distilled capsule hits */
  summary: retrievalSummarySchema.nullable().default(null),
});

export type CapsuleMatch = z.infer<typeof capsuleMatchSchema>;
export type ProfileHint = z.infer<typeof profileHintSchema>;
export type RetrievalV2Query = z.infer<typeof retrievalV2QuerySchema>;
export type RetrievalV2Response = z.infer<typeof retrievalV2ResponseSchema>;
