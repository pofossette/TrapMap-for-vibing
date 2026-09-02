import { z } from 'zod';

import { skillArtifactSchema } from '../artifacts.js';
import {
  actorRefSchema,
  entityIdSchema,
  isoTimestampSchema,
  lifecycleStateSchema,
  sha256HexSchema,
} from '../common.js';
import { agentReviewResultSchema, reviewDecisionSchema } from '../knowledge.js';

export const skillEditResponseSchema = z
  .object({
    /** Updated artifact with new revision */
    artifact: skillArtifactSchema,
    /** Revision number before this edit */
    previousRevision: z.number().int().min(1),
    /** Lifecycle state transition if applicable */
    lifecycleTransition: z
      .object({
        from: lifecycleStateSchema,
        to: lifecycleStateSchema,
      })
      .optional(),
  })
  .strict();

/**
 * Skill revision summary schema.
 * Lightweight view of a revision without full file manifests.
 * Used in history listing to avoid over-exposing artifact content.
 */

export const skillRevisionSummarySchema = z.object({
  /** Revision number */
  revision: z.number().int().min(1),
  /** When this revision was submitted */
  submittedAt: isoTimestampSchema,
  /** Who submitted this revision */
  submittedBy: actorRefSchema,
  /** Brief description of changes (optional) */
  summary: z.string().max(500).optional(),
  /** Lifecycle state after this revision */
  lifecycleState: lifecycleStateSchema,
  /** Semver version declared in SKILL.md frontmatter (absent for unversioned skills) */
  version: z
    .string()
    .regex(
      /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    )
    .optional(),
  /** SHA-256 hash of all source files for this revision */
  sourceHash: sha256HexSchema.optional(),
});

/**
 * Skill history response schema.
 * Returns revision summaries without full file manifests.
 * Distinct from artifact export - metadata-only for history viewing.
 */

export const skillHistoryResponseSchema = z
  .object({
    /** Artifact identifier */
    artifactId: entityIdSchema,
    /** Artifact title */
    title: z.string().min(1).max(280),
    /** Current (latest) revision number */
    currentRevision: z.number().int().min(1),
    /** Current lifecycle state */
    lifecycleState: lifecycleStateSchema,
    /** Revision history summaries */
    revisions: z.array(skillRevisionSummarySchema),
  })
  .strict();

export type SkillEditResponse = z.infer<typeof skillEditResponseSchema>;

export type SkillRevisionSummary = z.infer<typeof skillRevisionSummarySchema>;

export type SkillHistoryResponse = z.infer<typeof skillHistoryResponseSchema>;

// ============================================================================
// Phase 20: Skill Review Contracts (SKED-03)
// ============================================================================
// ============================================================================
// Phase 20: Skill Review Contracts (SKED-03)
// ============================================================================

/**
 * Skill review queue item schema.
 * Represents a single artifact pending review.
 */

export const skillReviewQueueItemSchema = z.object({
  /** The artifact with pending review */
  artifact: skillArtifactSchema,
  /** The revision under review */
  revision: z.number().int().min(1),
  /** Agent review result */
  agentReview: agentReviewResultSchema.nullable(),
  /** Who submitted this revision */
  submittedBy: actorRefSchema,
  /** Previous review decision if any */
  lastDecision: reviewDecisionSchema.nullable(),
});

/**
 * Skill review queue response schema.
 * Lists artifacts pending review.
 */

export const skillReviewQueueResponseSchema = z
  .object({
    /** Queue items */
    items: z.array(skillReviewQueueItemSchema),
    /** Pagination cursor */
    nextCursor: z.string().nullable(),
    /** Total count */
    total: z.number().int().min(0),
  })
  .refine((d) => d.items.length <= d.total, {
    message: 'items.length must be <= total',
  });

/**
 * Skill review decision response schema.
 * Returns the updated artifact and state transition.
 */

export const skillReviewDecisionResponseSchema = z
  .object({
    /** The updated artifact */
    artifact: skillArtifactSchema,
    /** Lifecycle state before review */
    previousState: lifecycleStateSchema,
    /** Lifecycle state after review */
    newState: lifecycleStateSchema,
  })
  .strict();

export type SkillReviewQueueItem = z.infer<typeof skillReviewQueueItemSchema>;

export type SkillReviewQueueResponse = z.infer<typeof skillReviewQueueResponseSchema>;

export type SkillReviewDecisionResponse = z.infer<typeof skillReviewDecisionResponseSchema>;
