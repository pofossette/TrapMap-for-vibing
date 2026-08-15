import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from './common.js';

export const readModelProjectionSchema = z.enum([
  'knowledge-search',
  'skill-search',
  'review-queue',
  'feedback-queue',
  'operations-dashboard',
]);

export const candidateProcessingPayloadSchema = z
  .object({
    candidateId: entityIdSchema,
    retryCount: z.number().int().min(0),
  })
  .strict();

export const remediationReactivationPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    entryType: z.enum(['trap', 'skill']),
    feedbackIds: z.array(entityIdSchema).min(1),
    resolvedAt: isoTimestampSchema,
    resolvedByUserId: entityIdSchema.nullable(),
    notes: z.string().max(1000).nullable(),
  })
  .strict();

export const badcaseExportDraftPayloadSchema = z
  .object({
    feedbackId: entityIdSchema,
    entryId: entityIdSchema,
    entryType: z.enum(['trap', 'skill']),
    queryId: z.string().min(1).nullable(),
    requestId: entityIdSchema.nullable().default(null),
    traceId: entityIdSchema.nullable().default(null),
  })
  .strict();

export const governanceConflictDetectionPayloadSchema = z
  .object({
    entryId: entityIdSchema,
    sourceEventId: entityIdSchema,
  })
  .strict();

export type ReadModelProjection = z.infer<typeof readModelProjectionSchema>;
export type CandidateProcessingPayload = z.infer<typeof candidateProcessingPayloadSchema>;
export type RemediationReactivationPayload = z.infer<typeof remediationReactivationPayloadSchema>;
export type BadcaseExportDraftPayload = z.infer<typeof badcaseExportDraftPayloadSchema>;
export type GovernanceConflictDetectionPayload = z.infer<
  typeof governanceConflictDetectionPayloadSchema
>;
