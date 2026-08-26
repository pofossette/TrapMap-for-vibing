import { z } from 'zod';

import { geneSourceKindSchema } from '../enum-types/experience-gene.js';
import { entityIdSchema } from './common.js';
import { type ExperienceGene, experienceGeneSchema } from './experience-gene.js';
import { retrievalFiltersSchema, routingTraceSchema } from './retrieval.js';

export const experienceGenePublicSchema = z.object({
  geneId: entityIdSchema,
  schemaVersion: z.literal('1'),
  status: experienceGeneSchema.shape.status,
  title: z.string().min(1).max(280),
  signalsMatch: z.array(z.string().min(1).max(120)).min(1).max(20),
  summary: z.string().min(1).max(1000),
  strategy: z.array(z.string().min(1).max(500)).min(1).max(7),
  avoid: z.array(z.string().min(1).max(500)).max(7),
  constraints: z.array(z.string().min(1).max(280)).default([]),
  validation: z.array(z.string().min(1).max(280)).default([]),
  labels: experienceGeneSchema.shape.labels,
  scope: experienceGeneSchema.shape.scope,
  teamId: entityIdSchema.nullable(),
  requiredLevel: experienceGeneSchema.shape.requiredLevel,
  updatedAt: experienceGeneSchema.shape.updatedAt,
});
// Parsing a full aggregate strips private provenance/indexing fields.

export type ExperienceGenePublic = z.infer<typeof experienceGenePublicSchema>;

export const geneSourceCitationSchema = z.object({
  kind: geneSourceKindSchema,
  sourceId: entityIdSchema,
  sourceRevision: z.number().int().min(1),
  artifactId: entityIdSchema.nullable(),
  capsuleId: entityIdSchema.nullable(),
});
// Accept the aggregate source projection and strip hash/revision internals.

export type GeneSourceCitation = z.infer<typeof geneSourceCitationSchema>;

export const geneSearchQuerySchema = z
  .object({
    seed: z.string().min(1).max(2000),
    filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
    maxResults: z.number().int().min(1).max(5).default(1),
    includeActivationHints: z.boolean().default(false),
  })
  .strict();

export type GeneSearchQuery = z.infer<typeof geneSearchQuerySchema>;

export const geneMatchSchema = z
  .object({
    gene: experienceGenePublicSchema,
    score: z.number().min(0).max(1),
    reason: z.string().min(1).max(500),
    sourceCitation: geneSourceCitationSchema,
    warnings: z.array(z.string().min(1).max(200)).max(3).default([]),
  })
  .strict();

export type GeneMatch = z.infer<typeof geneMatchSchema>;

export const geneAvoidWarningSchema = z
  .object({
    geneId: entityIdSchema,
    title: z.string().min(1).max(280),
    avoidCue: z.string().min(1).max(500),
    reason: z.string().min(1).max(300),
    score: z.number().min(0).max(1),
    sourceCitation: geneSourceCitationSchema,
  })
  .strict();

export type GeneAvoidWarning = z.infer<typeof geneAvoidWarningSchema>;

export const geneSearchResponseSchema = z
  .object({
    queryId: z.string().optional(),
    primaryGene: geneMatchSchema.nullable(),
    supplementaryAvoid: z.array(geneAvoidWarningSchema).max(3).default([]),
    routingTrace: routingTraceSchema.optional(),
  })
  .strict();

export type GeneSearchResponse = z.infer<typeof geneSearchResponseSchema>;

export function disabledExperienceGeneSearchResponse(): GeneSearchResponse {
  return geneSearchResponseSchema.parse({
    primaryGene: null,
    supplementaryAvoid: [],
    routingTrace: {
      selectedMode: 'naive',
      routeFamily: 'entry',
      routingReason: 'fallback-default',
      fallbackApplied: true,
      channelsUsed: [],
      fallbackTarget: null,
      confidenceScore: 0,
      confidenceBucket: 'low',
    },
  });
}

export function toExperienceGenePublic(gene: ExperienceGene): ExperienceGenePublic {
  return experienceGenePublicSchema.parse(gene);
}
