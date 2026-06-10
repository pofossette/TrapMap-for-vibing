import { z } from 'zod';

import { actorRefSchema, entityIdSchema, isoTimestampSchema } from './common.js';
import { decayStateSchema } from './decay.js';

/**
 * Problem type enum for feedback categorization.
 * Ensures consistent categorization across all feedback submissions.
 */
export const feedbackProblemTypeSchema = z.enum([
  'incorrect', // Solution is wrong or has errors
  'outdated', // Information is stale or no longer applies
  'context-mismatch', // Doesn't apply to current situation
  'incomplete', // Missing critical information
  'other', // Catch-all for uncategorized feedback
]);

/**
 * Schema for custom feedback prompt answer.
 * Used when skill artifacts define custom feedback prompts.
 */
export const feedbackCustomAnswerSchema = z
  .object({
    prompt: z.string().min(1).max(500),
    answer: z.string().min(1).max(2000),
  })
  .strict();

/**
 * Request payload for feedback submission.
 * Validated on server before persisting to feedback queue.
 */
export const feedbackSubmissionSchema = z
  .object({
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
  })
  .strict();

/**
 * Status enum for feedback queue items.
 * Tracks processing state for admin review workflow.
 */
export const feedbackStatusSchema = z.enum([
  'new', // Newly submitted, awaiting triage
  'triaged', // Reviewed by admin, action pending
  'resolved', // Issue addressed
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
 * Shared remediation state derived from unresolved feedback.
 * This is separate from raw feedback history and can be attached to trap/skill records
 * or emitted by admin remediation queue endpoints.
 */
export const feedbackRemediationStateSchema = z
  .object({
    status: z.enum(['none', 'pending-human-review', 'in-remediation', 'ready-to-reindex']),
    triggeredByFeedbackCount: z.number().int().min(0),
    threshold: z.number().int().min(1),
    suppressedFromRetrieval: z.boolean(),
    suppressedFromIndex: z.boolean(),
    activeFeedbackIds: z.array(entityIdSchema),
    openedAt: isoTimestampSchema.nullable(),
    openedByUserId: entityIdSchema.nullable(),
    resolvedAt: isoTimestampSchema.nullable(),
    resolvedByUserId: entityIdSchema.nullable(),
  })
  .strict();

/**
 * Response schema for feedback submission endpoint.
 */
export const feedbackResponseSchema = z
  .object({
    feedback: feedbackRecordSchema,
  })
  .strict();

// =============================================================================
// Phase 57: Admin Feedback Management Schemas (FEEDBACK-02)
// =============================================================================

/**
 * Request schema for listing feedback queue items.
 * Supports filtering by status, problem type, entry, and age.
 */
export const feedbackListRequestSchema = z.object({
  /** Filter by feedback status (multiple allowed) */
  status: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string')
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return val;
  }, z.array(feedbackStatusSchema).optional()),
  /** Filter by problem type (multiple allowed) */
  problemType: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string')
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return val;
  }, z.array(feedbackProblemTypeSchema).optional()),
  /** Filter by specific entry ID */
  entryId: entityIdSchema.optional(),
  /** Filter by entry type */
  entryType: z.enum(['trap', 'skill']).optional(),
  /** Filter by minimum age in days */
  minAgeDays: z.coerce.number().int().min(0).optional(),
  /** Filter by maximum age in days */
  maxAgeDays: z.coerce.number().int().min(0).optional(),
  /** Maximum items to return */
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * List item schema for feedback queue.
 * Includes entry shortcut for display and age for filtering.
 */
export const feedbackListItemSchema = z.object({
  /** Unique feedback record identifier */
  id: entityIdSchema,
  /** ID of the entry being reported */
  entryId: entityIdSchema,
  /** Type of the entry being reported */
  entryType: z.enum(['trap', 'skill']),
  /** Shortcut/slug of the entry for display */
  entryShortcut: z.string(),
  /** Problem classification */
  problemType: feedbackProblemTypeSchema,
  /** User-provided description */
  description: z.string().min(1),
  /** Optional context */
  context: z.string().nullable(),
  /** When the feedback was submitted */
  submittedAt: isoTimestampSchema,
  /** User who submitted the feedback */
  submittedBy: actorRefSchema,
  /** Current processing status */
  status: feedbackStatusSchema,
  /** Age in days since submission */
  ageDays: z.number(),
  /** Admin notes added during review */
  adminNotes: z.string().nullable(),
});

/**
 * Response schema for feedback list endpoint.
 */
export const feedbackListResponseSchema = z
  .object({
    items: z.array(feedbackListItemSchema),
    total: z.number().int().min(0),
  })
  .strict();

/**
 * Batch action types for feedback processing.
 */
export const feedbackBatchActionSchema = z.enum(['resolve', 'dismiss', 'triage', 'transition']);

/**
 * Request schema for batch operations on feedback.
 * Supports resolve, dismiss, triage, and transition actions.
 */
export const feedbackBatchRequestSchema = z.object({
  /** Feedback IDs to process */
  feedbackIds: z.array(entityIdSchema).min(1).max(100),
  /** Action to perform */
  action: feedbackBatchActionSchema,
  /** Admin notes for the action */
  notes: z.string().max(1000).optional(),
  /** Target decay state for transition action */
  transitionTarget: decayStateSchema.optional(),
  /** Preview mode - return plan without persisting */
  dryRun: z.boolean().default(false),
});

/**
 * Individual item result in a batch operation response.
 */
export const feedbackBatchItemSchema = z
  .object({
    /** Feedback record ID */
    feedbackId: entityIdSchema,
    /** Whether this feedback is eligible for the action */
    eligible: z.boolean(),
    /** Reason if ineligible */
    reason: z.string().nullable(),
    /** Whether a transition was applied (for transition action) */
    transitionApplied: z.boolean(),
  })
  .refine((d) => !d.eligible || d.reason === null, {
    message: 'reason must be null when eligible is true',
  })
  .refine((d) => d.eligible || d.reason !== null, {
    message: 'reason must be non-null when eligible is false',
  });

/**
 * Response schema for batch operations on feedback.
 */
export const feedbackBatchResponseSchema = z
  .object({
    /** Action performed */
    action: feedbackBatchActionSchema,
    /** Whether this was a dry-run */
    dryRun: z.boolean(),
    /** Per-feedback results */
    items: z.array(feedbackBatchItemSchema),
    /** Count of eligible feedbacks */
    totalEligible: z.number().int().min(0),
    /** Count of ineligible feedbacks */
    totalIneligible: z.number().int().min(0),
    /** When the action was applied (null for dry-run) */
    appliedAt: isoTimestampSchema.nullable(),
  })
  .strict()
  .refine((d) => !d.dryRun || d.appliedAt === null, {
    message: 'appliedAt must be null when dryRun is true',
  });

/**
 * Quality score schema for entry feedback statistics.
 * Provides metrics for evaluating entry quality based on feedback.
 */
export const qualityScoreSchema = z
  .object({
    /** Total feedback count for the entry */
    totalFeedback: z.number().int().min(0),
    /** Count of unresolved feedback (new or triaged) */
    unresolvedFeedback: z.number().int().min(0),
    /** Count of outdated reports */
    outdatedReports: z.number().int().min(0),
    /** Count of incorrect reports */
    incorrectReports: z.number().int().min(0),
    /** Computed quality score (0 to 1, higher is better) */
    qualityScore: z.number().min(0).max(1),
    /** Timestamp of most recent feedback */
    lastFeedbackAt: isoTimestampSchema.nullable(),
  })
  .refine((d) => d.unresolvedFeedback <= d.totalFeedback, {
    message: 'unresolvedFeedback must not exceed totalFeedback',
  })
  .refine((d) => d.outdatedReports + d.incorrectReports <= d.totalFeedback, {
    message: 'outdatedReports + incorrectReports must not exceed totalFeedback',
  });

/**
 * Response schema for feedback stats endpoint.
 * Returns quality score and recent feedback for an entry.
 */
export const feedbackStatsResponseSchema = z
  .object({
    /** Entry ID */
    entryId: entityIdSchema,
    /** Entry type (trap or skill) */
    entryType: z.enum(['trap', 'skill']),
    /** Quality score metrics */
    quality: qualityScoreSchema,
    /** Recent feedback items (up to 10) */
    recentFeedback: z.array(feedbackListItemSchema).max(10),
  })
  .strict();

export const feedbackRemediationSourceSnapshotSchema = z
  .object({
    trapDetail: z.string().nullable().optional(),
    skillRevision: z.number().int().min(1).nullable().optional(),
    skillProfileSummary: z.string().nullable().optional(),
    skillCapsules: z
      .array(
        z
          .object({
            capsuleId: entityIdSchema,
            problem: z.string().min(1),
            content: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const feedbackRemediationQueueItemSchema = z
  .object({
    entryId: entityIdSchema,
    entryType: z.enum(['trap', 'skill']),
    title: z.string().min(1),
    remediation: feedbackRemediationStateSchema,
    unresolvedFeedbackCount: z.number().int().min(0),
    sourceSnapshot: feedbackRemediationSourceSnapshotSchema,
    recentFeedback: z.array(feedbackListItemSchema),
  })
  .strict();

export const feedbackRemediationQueueResponseSchema = z
  .object({
    items: z.array(feedbackRemediationQueueItemSchema),
    total: z.number().int().min(0),
  })
  .strict();

export const feedbackRemediationDetailResponseSchema = z
  .object({
    item: feedbackRemediationQueueItemSchema,
  })
  .strict();

export const feedbackRemediationCompleteRequestSchema = z
  .object({
    notes: z.string().min(1).max(1000),
  })
  .strict();

export const feedbackRemediationCompleteResponseSchema = z
  .object({
    entryId: entityIdSchema,
    entryType: z.enum(['trap', 'skill']),
    resolvedFeedbackIds: z.array(entityIdSchema),
    resolvedCount: z.number().int().min(0),
    resolvedAt: isoTimestampSchema,
  })
  .strict();

// =============================================================================
// Phase 65: Lifecycle Trigger Rules (FEEDBACK-03)
// =============================================================================

/**
 * Rule for automatic lifecycle transitions triggered by feedback patterns.
 * When a minimum number of feedback items of a specific problem type
 * accumulate within a time window, the entry transitions to a target state.
 */
export const lifecycleTriggerRuleSchema = z.object({
  /** Problem type that triggers this rule */
  problemType: feedbackProblemTypeSchema,
  /** Minimum feedback count to trigger */
  minCount: z.number().int().min(1).default(3),
  /** Time window in days for counting feedback */
  timeWindowDays: z.number().int().min(1).default(30),
  /** Decay state to transition to */
  targetDecayState: decayStateSchema,
});

export type LifecycleTriggerRule = z.infer<typeof lifecycleTriggerRuleSchema>;

/**
 * Default lifecycle trigger rules.
 * - 3 'outdated' feedback in 30 days -> stale
 * - 5 'incorrect' feedback in 30 days -> review-due
 */
export const DEFAULT_LIFECYCLE_TRIGGER_RULES: LifecycleTriggerRule[] = [
  { problemType: 'outdated', minCount: 3, timeWindowDays: 30, targetDecayState: 'stale' },
  { problemType: 'incorrect', minCount: 5, timeWindowDays: 30, targetDecayState: 'review-due' },
];

// Type exports
export type FeedbackProblemType = z.infer<typeof feedbackProblemTypeSchema>;
export type FeedbackCustomAnswer = z.infer<typeof feedbackCustomAnswerSchema>;
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
export type FeedbackStatus = z.infer<typeof feedbackStatusSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
export type FeedbackRemediationState = z.infer<typeof feedbackRemediationStateSchema>;
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
export type FeedbackListRequest = z.infer<typeof feedbackListRequestSchema>;
export type FeedbackListItem = z.infer<typeof feedbackListItemSchema>;
export type FeedbackListResponse = z.infer<typeof feedbackListResponseSchema>;
export type FeedbackBatchAction = z.infer<typeof feedbackBatchActionSchema>;
export type FeedbackBatchRequest = z.infer<typeof feedbackBatchRequestSchema>;
export type FeedbackBatchItem = z.infer<typeof feedbackBatchItemSchema>;
export type FeedbackBatchResponse = z.infer<typeof feedbackBatchResponseSchema>;
export type QualityScore = z.infer<typeof qualityScoreSchema>;
export type FeedbackStatsResponse = z.infer<typeof feedbackStatsResponseSchema>;
export type FeedbackRemediationQueueItem = z.infer<typeof feedbackRemediationQueueItemSchema>;
export type FeedbackRemediationQueueResponse = z.infer<
  typeof feedbackRemediationQueueResponseSchema
>;
export type FeedbackRemediationDetailResponse = z.infer<
  typeof feedbackRemediationDetailResponseSchema
>;
export type FeedbackRemediationCompleteRequest = z.infer<
  typeof feedbackRemediationCompleteRequestSchema
>;
export type FeedbackRemediationCompleteResponse = z.infer<
  typeof feedbackRemediationCompleteResponseSchema
>;
