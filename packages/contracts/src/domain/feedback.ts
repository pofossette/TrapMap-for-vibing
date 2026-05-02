import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema, actorRefSchema } from './common.js';

/**
 * Problem type enum for feedback categorization.
 * Ensures consistent categorization across all feedback submissions.
 */
export const feedbackProblemTypeSchema = z.enum([
  'incorrect',       // Solution is wrong or has errors
  'outdated',        // Information is stale or no longer applies
  'context-mismatch', // Doesn't apply to current situation
  'incomplete',      // Missing critical information
  'other',           // Catch-all for uncategorized feedback
]);

/**
 * Schema for custom feedback prompt answer.
 * Used when skill artifacts define custom feedback prompts.
 */
export const feedbackCustomAnswerSchema = z.object({
  prompt: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
});

/**
 * Request payload for feedback submission.
 * Validated on server before persisting to feedback queue.
 */
export const feedbackSubmissionSchema = z.object({
  /** ID of the entry being reported (trap or skill artifact) */
  entryId: entityIdSchema,
  /** Type of the entry being reported */
  entryType: z.enum(['trap', 'skill']),
  /** Problem classification from controlled vocabulary */
  problemType: feedbackProblemTypeSchema,
  /** User-provided description of the problem (required, min 10 chars) */
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  /** Optional context: what the user was trying to do */
  context: z.string().max(1000).optional(),
  /** Optional: which retrieval query led to this entry */
  querySeed: z.string().max(500).optional(),
  /** Optional: custom prompt answers if skill defined feedbackPrompts */
  customAnswers: z.array(feedbackCustomAnswerSchema).optional(),
});

/**
 * Status enum for feedback queue items.
 * Tracks processing state for admin review workflow.
 */
export const feedbackStatusSchema = z.enum([
  'new',       // Newly submitted, awaiting triage
  'triaged',   // Reviewed by admin, action pending
  'resolved',  // Issue addressed
  'dismissed', // Feedback rejected as invalid
]);

/**
 * Full feedback record stored in the queue.
 * Includes submission data plus metadata for admin review.
 */
export const feedbackRecordSchema = feedbackSubmissionSchema.extend({
  /** Unique feedback record identifier */
  id: entityIdSchema,
  /** When the feedback was submitted */
  submittedAt: isoTimestampSchema,
  /** User who submitted the feedback */
  submittedBy: actorRefSchema,
  /** Current processing status */
  status: feedbackStatusSchema,
  /** Admin notes added during review (Phase 57) */
  adminNotes: z.string().max(1000).optional(),
});

/**
 * Response schema for feedback submission endpoint.
 */
export const feedbackResponseSchema = z.object({
  feedback: feedbackRecordSchema,
});

// Type exports
export type FeedbackProblemType = z.infer<typeof feedbackProblemTypeSchema>;
export type FeedbackCustomAnswer = z.infer<typeof feedbackCustomAnswerSchema>;
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
