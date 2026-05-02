import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from './common.js';

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
  evergreen: evergreenDecayConfigSchema.default({ enabled: false }),
  versioned: versionedDecayConfigSchema.default({ enabled: true, mode: 'step', matchMultiplier: 1.0, mismatchMultiplier: 0.5 }),
  volatile: volatileDecayConfigSchema.default({ enabled: true, mode: 'exponential', halfLifeDays: 30, zeroDays: 90, floor: 0.3 }),
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
export const decayStateSchema = z.enum([
  'active',
  'review-due',
  'stale',
  'expired',
  'superseded',
]);

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
});

export type DecayState = z.infer<typeof decayStateSchema>;
export type DecayConfig = z.infer<typeof decayConfigSchema>;
export type DecayMeta = z.infer<typeof decayMetaSchema>;
