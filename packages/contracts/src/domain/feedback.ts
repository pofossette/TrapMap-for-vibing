import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema, actorRefSchema } from './common.js';
import { decayStateSchema } from './decay.js';

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

// =============================================================================
// Phase 57: Quality Score and Lifecycle Trigger Schemas (FEEDBACK-03)
// =============================================================================

/**
 * Breakdown of feedback counts by problem type.
 */
export const feedbackQualityBreakdownSchema = z.object({
  incorrect: z.number().int().min(0),
  outdated: z.number().int().min(0),
  contextMismatch: z.number().int().min(0),
  incomplete: z.number().int().min(0),
  other: z.number().int().min(0),
});

/**
 * Quality score derived from feedback signals for a knowledge entry.
 *
 * Score ranges from 0-100 (higher is better). Computed from weighted
 * feedback counts with age decay for recent feedback weighing more.
 */
export const feedbackQualityScoreSchema = z.object({
  /** Entry ID this score applies to */
  entryId: entityIdSchema,
  /** Overall quality score (0-100, higher is better) */
  score: z.number().min(0).max(100),
  /** Breakdown by feedback type */
  breakdown: feedbackQualityBreakdownSchema,
  /** Total non-dismissed feedback count */
  totalFeedback: z.number().int().min(0),
  /** Score computation timestamp */
  computedAt: isoTimestampSchema,
});

/**
 * Rule for triggering lifecycle transitions based on feedback patterns.
 *
 * When minCount feedback of problemType occurs within timeWindowDays,
 * the entry transitions to targetDecayState.
 */
export const lifecycleTriggerRuleSchema = z.object({
  /** Problem type to match */
  problemType: feedbackProblemTypeSchema,
  /** Minimum count to trigger */
  minCount: z.number().int().min(1),
  /** Time window in days for counting */
  timeWindowDays: z.number().int().min(1).max(365),
  /** Target decay state when triggered */
  targetDecayState: decayStateSchema,
});

/**
 * Default lifecycle trigger rules.
 *
 * - 3+ outdated reports in 90 days → stale
 * - 2+ incorrect reports in 30 days → review-due
 * - 5+ context-mismatch reports in 180 days → review-due
 */
export const DEFAULT_LIFECYCLE_TRIGGER_RULES: z.infer<typeof lifecycleTriggerRuleSchema>[] = [
  { problemType: 'outdated', minCount: 3, timeWindowDays: 90, targetDecayState: 'stale' },
  { problemType: 'incorrect', minCount: 2, timeWindowDays: 30, targetDecayState: 'review-due' },
  { problemType: 'context-mismatch', minCount: 5, timeWindowDays: 180, targetDecayState: 'review-due' },
];

// Type exports
export type FeedbackProblemType = z.infer<typeof feedbackProblemTypeSchema>;
export type FeedbackCustomAnswer = z.infer<typeof feedbackCustomAnswerSchema>;
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
export type FeedbackQualityBreakdown = z.infer<typeof feedbackQualityBreakdownSchema>;
export type FeedbackQualityScore = z.infer<typeof feedbackQualityScoreSchema>;
export type LifecycleTriggerRule = z.infer<typeof lifecycleTriggerRuleSchema>;

// =============================================================================
// Phase 57: Admin Feedback Management Schemas (FEEDBACK-02)
// =============================================================================

/**
 * Request schema for listing feedback queue with filters.
 *
 * Supports filtering by status, problem type, entry, and age range
 * for building the admin feedback management interface.
 */
export const feedbackListRequestSchema = z.object({
  /** Filter by feedback status (comma-separated or array) */
  status: z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
      return val;
    },
    z.array(feedbackStatusSchema).optional(),
  ),
  /** Filter by problem type (comma-separated or array) */
  problemType: z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
      return val;
    },
    z.array(feedbackProblemTypeSchema).optional(),
  ),
  /** Filter by entry ID */
  entryId: entityIdSchema.optional(),
  /** Filter by entry type */
  entryType: z.enum(['trap', 'skill']).optional(),
  /** Minimum age in days */
  ageMinDays: z.coerce.number().int().min(0).optional(),
  /** Maximum age in days */
  ageMaxDays: z.coerce.number().int().min(0).optional(),
  /** Pagination limit */
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Individual feedback item in list response.
 *
 * Enriched with entry shortcut and computed age for admin display.
 */
export const feedbackListItemSchema = z.object({
  id: entityIdSchema,
  entryId: entityIdSchema,
  entryType: z.enum(['trap', 'skill']),
  /** Denormalized entry shortcut for display */
  entryShortcut: z.string(),
  problemType: feedbackProblemTypeSchema,
  description: z.string(),
  context: z.string().nullable(),
  submittedAt: isoTimestampSchema,
  submittedByHandle: z.string(),
  status: feedbackStatusSchema,
  adminNotes: z.string().nullable(),
  /** Computed age in days from submittedAt */
  ageDays: z.number(),
});

/**
 * Response schema for feedback queue listing.
 *
 * When filtering by a single entryId, includes qualityScore for that entry.
 */
export const feedbackListResponseSchema = z.object({
  items: z.array(feedbackListItemSchema),
  total: z.number().int().min(0),
  nextCursor: z.string().min(1).max(128).nullable(),
  /** Quality score when filtering by single entryId */
  qualityScore: feedbackQualityScoreSchema.optional(),
});

export type FeedbackListRequest = z.infer<typeof feedbackListRequestSchema>;
export type FeedbackListItem = z.infer<typeof feedbackListItemSchema>;
export type FeedbackListResponse = z.infer<typeof feedbackListResponseSchema>;

// =============================================================================
// Phase 57: Feedback Batch Action Schemas (FEEDBACK-02)
// =============================================================================

/**
 * Batch action types for feedback processing.
 *
 * - resolve: Mark feedback as resolved, issue addressed
 * - dismiss: Mark feedback as dismissed/invalid
 * - triage: Mark feedback as triaged (acknowledged, pending action)
 * - request-info: Mark as needing more information from submitter
 * - transition: Trigger lifecycle transition on the associated entry
 */
export const feedbackBatchActionSchema = z.enum([
  'resolve',
  'dismiss',
  'triage',
  'request-info',
  'transition',
]);

/**
 * Request schema for batch processing feedback items.
 *
 * Supports multiple actions with optional dry-run mode for previewing changes.
 */
export const feedbackBatchRequestSchema = z.object({
  /** Action to perform */
  action: feedbackBatchActionSchema,
  /** IDs of feedback items to process (max 100) */
  feedbackIds: z.array(entityIdSchema).min(1).max(100),
  /** Preview changes without applying */
  dryRun: z.boolean().default(false),
  /** Notes to add to all processed items */
  notes: z.string().max(1000).optional(),
  /** For 'transition' action: target decay state for the entry */
  targetDecayState: decayStateSchema.optional(),
});

/**
 * Individual item result in a feedback batch response.
 *
 * Describes the planned or applied change for each feedback item.
 */
export const feedbackBatchItemSchema = z.object({
  feedbackId: entityIdSchema,
  entryId: entityIdSchema,
  entryShortcut: z.string(),
  currentStatus: feedbackStatusSchema,
  proposedStatus: feedbackStatusSchema,
  changeDescription: z.string(),
  eligible: z.boolean(),
  ineligibilityReason: z.string().nullable(),
  /** For 'transition' action: resulting decay state on the entry */
  resultingDecayState: decayStateSchema.nullable(),
});

/**
 * Response schema for feedback batch operations.
 */
export const feedbackBatchResponseSchema = z.object({
  action: feedbackBatchActionSchema,
  dryRun: z.boolean(),
  items: z.array(feedbackBatchItemSchema),
  totalEligible: z.number().int().min(0),
  totalIneligible: z.number().int().min(0),
  appliedAt: isoTimestampSchema.nullable(),
});

export type FeedbackBatchAction = z.infer<typeof feedbackBatchActionSchema>;
export type FeedbackBatchRequest = z.infer<typeof feedbackBatchRequestSchema>;
export type FeedbackBatchItem = z.infer<typeof feedbackBatchItemSchema>;
export type FeedbackBatchResponse = z.infer<typeof feedbackBatchResponseSchema>;
