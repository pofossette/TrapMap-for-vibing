/**
 * Configuration loader for decay state transitions.
 *
 * Reads decay thresholds from environment variables with Zod validation.
 * Follows the pattern from feature-flags.ts for consistency.
 */

import { decayConfigSchema, type DecayConfig } from '@trapmap/contracts';

/**
 * Environment variable names for decay configuration.
 */
const ENV_VARS = {
  reviewDueDays: 'TRAPMAP_DECAY_REVIEW_DUE_DAYS',
  staleDays: 'TRAPMAP_DECAY_STALE_DAYS',
  expireDays: 'TRAPMAP_DECAY_EXPIRE_DAYS',
  enabled: 'TRAPMAP_DECAY_ENABLED',
} as const;

/**
 * Load decay configuration from environment variables.
 *
 * Defaults match decayConfigSchema: 90/180/365 days, disabled.
 * Environment variables override defaults when set.
 * Zod validates all values are in range [1, 3650].
 *
 * @throws {ZodError} If any day threshold is out of range [1, 3650]
 */
export function loadDecayConfig(): DecayConfig {
  return decayConfigSchema.parse({
    reviewDueDays: Number(process.env[ENV_VARS.reviewDueDays] ?? 90),
    staleDays: Number(process.env[ENV_VARS.staleDays] ?? 180),
    expireDays: Number(process.env[ENV_VARS.expireDays] ?? 365),
    enabled: process.env[ENV_VARS.enabled] === 'true',
  });
}
