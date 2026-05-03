import { z } from 'zod';

import {
  actorRefSchema,
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  scopeSchema,
  securityLevelSchema,
} from './common.js';
import { decayAwareListItemSchema } from './decay.js';

// =============================================================================
// Phase 59: Maintenance Metadata Contracts (MAINT-01)
// =============================================================================

/**
 * Maintenance metadata for ownership and review-due tracking.
 *
 * Tracks the assigned maintainer and the scheduled review date
 * for SLA-aware knowledge lifecycle management.
 */
export const maintenanceMetaSchema = z.object({
  /** Current maintainer (null if unassigned) */
  maintainer: actorRefSchema.nullable().default(null),
  /** Scheduled review date for SLA tracking (null if not scheduled) */
  reviewBy: isoTimestampSchema.nullable().default(null),
});

/**
 * Action types for maintenance batch operations.
 *
 * - assign-owner: Assign or reassign a maintainer to entries
 * - extend-review: Extend the review-by deadline
 * - mark-verified: Mark entries as verified (resets review clock)
 */
export const maintenanceActionSchema = z.enum([
  'assign-owner',
  'extend-review',
  'mark-verified',
]);

/**
 * Request schema for listing entries with maintenance-related filters.
 *
 * Supports filtering by missing owner, overdue review, stale verification,
 * scope, labels, and pagination.
 */
export const maintenanceEntryListRequestSchema = z.object({
  /** Filter to entries without an assigned maintainer */
  missingOwner: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().optional(),
  ),
  /** Filter to entries past their review-by date */
  reviewOverdue: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().optional(),
  ),
  /** Filter to entries with stale verification (lastVerifiedAt older than staleDays) */
  staleVerification: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().optional(),
  ),
  /** Number of days since last verification to consider stale (requires staleVerification) */
  staleDays: z.coerce.number().int().min(1).max(3650).optional(),
  /** Filter by scope */
  scope: scopeSchema.optional(),
  /** Filter by labels */
  labels: z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined;
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
      return val;
    },
    z.array(labelSchema).optional(),
  ),
  /** Maximum number of items to return */
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Maintenance-aware list item extending decay-aware metadata.
 *
 * Adds maintainer and review-by fields to the decay-aware list item
 * for the maintenance management interface.
 */
export const maintenanceAwareListItemSchema = decayAwareListItemSchema.extend({
  /** Current maintainer (null if unassigned) */
  maintainer: actorRefSchema.nullable(),
  /** Scheduled review date (null if not scheduled) */
  reviewBy: isoTimestampSchema.nullable(),
});

/**
 * Response schema for maintenance-aware entry listing.
 */
export const maintenanceEntryListResponseSchema = z.object({
  items: z.array(maintenanceAwareListItemSchema),
  total: z.number().int().min(0),
});

/**
 * Request schema for maintenance batch operations.
 *
 * Supports assign-owner, extend-review, and mark-verified actions
 * with optional dry-run mode for previewing changes.
 */
export const maintenanceBatchOperationRequestSchema = z.object({
  /** Action to perform on selected entries */
  action: maintenanceActionSchema,
  /** Entry IDs to operate on (1-100) */
  entryIds: z.array(entityIdSchema).min(1).max(100),
  /** If true, preview changes without applying them */
  dryRun: z.boolean().default(false),
  /** New maintainer user ID (required for assign-owner action) */
  newMaintainerId: entityIdSchema.optional(),
  /** New maintainer handle (for assign-owner action display) */
  newMaintainerHandle: z.string().max(200).optional(),
  /** Number of days to extend review-by (required for extend-review action) */
  extendDays: z.number().int().min(1).max(3650).optional(),
});

/**
 * Individual item result in a maintenance batch operation response.
 *
 * Each entry in the batch gets an item describing the planned or applied change,
 * eligibility status, and reason if ineligible.
 */
export const maintenanceBatchOperationItemSchema = z.object({
  /** Entry ID */
  entryId: entityIdSchema,
  /** Entry shortcut for display */
  shortcut: z.string(),
  /** Current maintainer (null if unassigned) */
  currentMaintainer: actorRefSchema.nullable(),
  /** Current review-by date (null if not scheduled) */
  currentReviewBy: isoTimestampSchema.nullable(),
  /** Description of the proposed change */
  proposedChange: z.string(),
  /** Whether this entry is eligible for the requested action */
  eligible: z.boolean(),
  /** Reason for ineligibility (null if eligible) */
  ineligibilityReason: z.string().nullable(),
});

/**
 * Response schema for maintenance batch operations.
 *
 * Returns the action taken, dry-run flag, per-entry items with eligibility,
 * counts, and the applied timestamp (null for dry-run).
 */
export const maintenanceBatchOperationResponseSchema = z.object({
  /** Action that was performed */
  action: maintenanceActionSchema,
  /** Whether this was a dry run */
  dryRun: z.boolean(),
  /** Per-entry results */
  items: z.array(maintenanceBatchOperationItemSchema),
  /** Count of eligible entries */
  totalEligible: z.number().int().min(0),
  /** Count of ineligible entries */
  totalIneligible: z.number().int().min(0),
  /** When the batch was applied (null for dry-run) */
  appliedAt: isoTimestampSchema.nullable(),
});

export type MaintenanceMeta = z.infer<typeof maintenanceMetaSchema>;
export type MaintenanceAction = z.infer<typeof maintenanceActionSchema>;
export type MaintenanceEntryListRequest = z.infer<typeof maintenanceEntryListRequestSchema>;
export type MaintenanceAwareListItem = z.infer<typeof maintenanceAwareListItemSchema>;
export type MaintenanceEntryListResponse = z.infer<typeof maintenanceEntryListResponseSchema>;
export type MaintenanceBatchOperationRequest = z.infer<typeof maintenanceBatchOperationRequestSchema>;
export type MaintenanceBatchOperationItem = z.infer<typeof maintenanceBatchOperationItemSchema>;
export type MaintenanceBatchOperationResponse = z.infer<typeof maintenanceBatchOperationResponseSchema>;
