import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from './common.js';

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
