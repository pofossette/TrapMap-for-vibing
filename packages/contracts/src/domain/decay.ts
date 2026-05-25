import { z } from 'zod';

import {
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  lifecycleStateSchema,
  scopeSchema,
  securityLevelSchema,
} from './common.js';

/**
 * Freshness type for knowledge entries.
 *
 * Determines which decay curve to apply for retrieval ranking:
 * - evergreen: No time-based decay (reference docs, best practices)
 * - versioned: Step decay on version mismatch (version-specific traps)
 * - volatile: Time-based exponential decay (incident workarounds, temporary fixes)
 */
export const freshnessTypeSchema = z.enum(['evergreen', 'versioned', 'volatile']);

export type FreshnessType = z.infer<typeof freshnessTypeSchema>;

/**
 * Decay mode for freshness-based ranking.
 */
export const freshnessDecayModeSchema = z.enum(['exponential', 'linear', 'step']);

/**
 * Configuration for evergreen content decay.
 * Evergreen content never decays by time (enabled is always false).
 */
export const evergreenDecayConfigSchema = z.object({
  enabled: z.literal(false),
});

/**
 * Configuration for versioned content decay.
 * Uses step decay: full multiplier on match, reduced on mismatch.
 */
export const versionedDecayConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.literal('step'),
  matchMultiplier: z.number().min(0).max(1).default(1.0),
  mismatchMultiplier: z.number().min(0).max(1).default(0.5),
});

/**
 * Configuration for volatile content decay.
 * Supports exponential or linear decay over time.
 */
export const volatileDecayConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['exponential', 'linear']).default('exponential'),
  halfLifeDays: z.number().int().min(1).max(3650).default(30),
  zeroDays: z.number().int().min(1).max(3650).default(90),
  floor: z.number().min(0).max(0.9).default(0.3),
});

/**
 * Complete freshness decay configuration for all content types.
 */
export const freshnessDecayConfigSchema = z.object({
  evergreen: evergreenDecayConfigSchema,
  versioned: versionedDecayConfigSchema,
  volatile: volatileDecayConfigSchema,
});

export type FreshnessDecayMode = z.infer<typeof freshnessDecayModeSchema>;
export type EvergreenDecayConfig = z.infer<typeof evergreenDecayConfigSchema>;
export type VersionedDecayConfig = z.infer<typeof versionedDecayConfigSchema>;
export type VolatileDecayConfig = z.infer<typeof volatileDecayConfigSchema>;
export type FreshnessDecayConfig = z.infer<typeof freshnessDecayConfigSchema>;

/**
 * Decay state for knowledge lifecycle management.
 *
 * States transition based on age and configuration thresholds:
 * - active: Fresh, recently verified knowledge
 * - review-due: Age >= reviewDueDays, needs human review
 * - stale: Age >= staleDays, relevance diminished
 * - expired: Age >= expireDays, should be retired
 * - superseded: Replaced by newer knowledge (regardless of age)
 */
export const decayStateSchema = z.enum(['active', 'review-due', 'stale', 'expired', 'superseded']);

/**
 * Configuration for decay state transitions.
 *
 * All day thresholds must be between 1 and 3650 (10 years max).
 * The feature is disabled by default for safe rollout.
 */
export const decayConfigSchema = z.object({
  /** Days before entry needs review */
  reviewDueDays: z.number().int().min(1).max(3650).default(90),
  /** Days before entry is considered stale */
  staleDays: z.number().int().min(1).max(3650).default(180),
  /** Days before entry expires */
  expireDays: z.number().int().min(1).max(3650).default(365),
  /** Whether decay feature is enabled */
  enabled: z.boolean().default(false),
});

/**
 * Metadata for tracking decay state on knowledge entries and skill artifacts.
 *
 * Persists the last verification time and computed decay state.
 * Superseded entries track their replacement via supersededById.
 */
export const decayMetaSchema = z.object({
  /** When this entry was last verified by a human */
  lastVerifiedAt: isoTimestampSchema,
  /** Current computed decay state */
  decayState: decayStateSchema,
  /** ID of the entry that supersedes this one, if any */
  supersededById: entityIdSchema.nullable().default(null),
  /** When the decay state was last computed */
  decayStateComputedAt: isoTimestampSchema,
  /** Freshness type determines decay curve (default: evergreen for backward compatibility) */
  freshnessType: freshnessTypeSchema.default('evergreen'),
});

export type DecayState = z.infer<typeof decayStateSchema>;
export type DecayConfig = z.infer<typeof decayConfigSchema>;
export type DecayMeta = z.infer<typeof decayMetaSchema>;

// =============================================================================
// Phase 50: Batch Management Interface Schemas (DECAY-03)
// =============================================================================

/**
 * Batch action types for decay management.
 *
 * - extend: Reset lastVerifiedAt to now, pushing entry back to active state
 * - mark-review: Explicitly set decayState to review-due regardless of age
 * - deactivate: Set lifecycleState to deactivated
 * - supersede: Replace entry with another (requires replacementId)
 */
export const batchActionSchema = z.enum(['extend', 'mark-review', 'deactivate', 'supersede']);

/**
 * Decay-aware list item with extended metadata for batch management.
 *
 * Extends the base knowledge list item with decay-specific fields
 * for filtering and display in the batch management interface.
 */
export const decayAwareListItemSchema = z.object({
  id: entityIdSchema,
  scope: scopeSchema,
  labels: z.array(labelSchema),
  shortcut: z.string(),
  lifecycleState: lifecycleStateSchema,
  requiredLevel: securityLevelSchema,
  updatedAt: z.string(),
  // Decay-specific fields
  decayState: decayStateSchema.nullable(),
  freshnessType: freshnessTypeSchema.nullable(),
  ageDays: z.number().nullable(),
  lastVerifiedAt: isoTimestampSchema.nullable(),
  supersededById: entityIdSchema.nullable(),
});

/**
 * Request schema for listing entries with decay-state filters.
 *
 * Supports filtering by decay state, age range, labels, and scope
 * for building the batch management discovery interface.
 */
export const decayEntryListRequestSchema = z.object({
  decayStates: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string')
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return val;
  }, z.array(decayStateSchema).optional()),
  ageMinDays: z.coerce.number().int().min(0).optional(),
  ageMaxDays: z.coerce.number().int().min(0).optional(),
  labels: z.preprocess((val) => {
    if (val === undefined || val === null) return undefined;
    if (Array.isArray(val)) return val;
    if (typeof val === 'string')
      return val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return val;
  }, z.array(labelSchema).optional()),
  scope: scopeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Response schema for decay-aware entry listing.
 */
export const decayEntryListResponseSchema = z.object({
  items: z.array(decayAwareListItemSchema),
  total: z.number().int().min(0),
});

/**
 * Request schema for batch operations on entries.
 *
 * Supports extend, mark-review, deactivate, and supersede actions
 * with optional dry-run mode for previewing changes.
 */
export const batchOperationRequestSchema = z.object({
  action: batchActionSchema,
  entryIds: z.array(entityIdSchema).min(1).max(100),
  dryRun: z.boolean().default(false),
  extendDays: z.number().int().min(1).max(3650).optional(),
  replacementId: entityIdSchema.optional(),
});

/**
 * Individual item result in a batch operation response.
 *
 * Each entry in the batch gets an item describing the planned or applied change,
 * eligibility status, and reason if ineligible.
 */
export const batchOperationItemSchema = z
  .object({
    entryId: entityIdSchema,
    shortcut: z.string(),
    currentDecayState: decayStateSchema.nullable(),
    proposedDecayState: decayStateSchema.nullable(),
    changeDescription: z.string(),
    eligible: z.boolean(),
    ineligibilityReason: z.string().nullable(),
  })
  .refine((d) => !d.eligible || d.ineligibilityReason === null, {
    message: 'ineligibilityReason must be null when eligible is true',
  });

/**
 * Response schema for batch operations.
 *
 * Returns the action taken, dry-run flag, per-entry items with eligibility,
 * counts, and the applied timestamp (null for dry-run).
 */
export const batchOperationResponseSchema = z
  .object({
    action: batchActionSchema,
    dryRun: z.boolean(),
    items: z.array(batchOperationItemSchema),
    totalEligible: z.number().int().min(0),
    totalIneligible: z.number().int().min(0),
    appliedAt: isoTimestampSchema.nullable(),
  })
  .refine((d) => !d.dryRun || d.appliedAt === null, {
    message: 'appliedAt must be null when dryRun is true',
  });

export type BatchAction = z.infer<typeof batchActionSchema>;
export type DecayAwareListItem = z.infer<typeof decayAwareListItemSchema>;
export type DecayEntryListRequest = z.infer<typeof decayEntryListRequestSchema>;
export type DecayEntryListResponse = z.infer<typeof decayEntryListResponseSchema>;
export type BatchOperationRequest = z.infer<typeof batchOperationRequestSchema>;
export type BatchOperationItem = z.infer<typeof batchOperationItemSchema>;
export type BatchOperationResponse = z.infer<typeof batchOperationResponseSchema>;
