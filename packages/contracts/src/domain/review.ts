import { z } from 'zod';

import { boundarySchema } from './boundary.js';
import {
  actorRefSchema,
  entityIdSchema,
  lifecycleStateSchema,
  paginatedQuerySchema,
} from './common.js';
import { evidenceMetaSchema } from './evidence.js';
import {
  agentReviewResultSchema,
  knowledgeEntrySchema,
  knowledgeSubmissionHistoryResponseSchema,
  knowledgeSubmissionRecordSchema,
  reviewDecisionSchema,
  reviewNoteSchema,
} from './knowledge.js';

export const reviewQueueQuerySchema = paginatedQuerySchema
  .extend({
    status: lifecycleStateSchema.optional(),
    teamId: entityIdSchema.optional(),
  })
  .strict();

export const reviewDecisionRequestSchema = z
  .object({
    entryId: entityIdSchema,
    decision: z.enum(['approve', 'reject']),
    notes: z.string().min(1).max(2000),
    boundary: boundarySchema.nullable().optional(),
    evidence: evidenceMetaSchema
      .omit({ verifiedAt: true, verifiedBy: true })
      .extend({
        verifiedAt: evidenceMetaSchema.shape.verifiedAt.optional(),
        verifiedBy: evidenceMetaSchema.shape.verifiedBy.optional(),
      })
      .optional(),
  })
  .strict();

export const reviewQueueItemSchema = z.object({
  entry: knowledgeEntrySchema,
  agentReview: agentReviewResultSchema.nullable(),
  submittedBy: actorRefSchema,
  lastDecision: reviewDecisionSchema.nullable().default(null),
  latestSubmission: knowledgeSubmissionRecordSchema.nullable().default(null),
  reviewNotes: z.array(reviewNoteSchema).default([]),
});

export const reviewQueueResponseSchema = z
  .object({
    items: z.array(reviewQueueItemSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().min(0),
  })
  .strict();

export const reviewerDecisionOutputSchema = z.object({
  entry: knowledgeEntrySchema,
  submission: knowledgeSubmissionRecordSchema.nullable().default(null),
  decision: reviewDecisionSchema,
});

export const submissionHistoryResponseSchema = knowledgeSubmissionHistoryResponseSchema;

export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;
export type ReviewDecisionRequest = z.infer<typeof reviewDecisionRequestSchema>;
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponseSchema>;
export type ReviewerDecisionOutput = z.infer<typeof reviewerDecisionOutputSchema>;
export type SubmissionHistoryResponse = z.infer<typeof submissionHistoryResponseSchema>;
