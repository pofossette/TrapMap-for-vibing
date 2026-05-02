/**
 * Configuration loader for decay state transitions.
 *
 * Reads decay thresholds from environment variables with Zod validation.
 * Follows the pattern from feature-flags.ts for consistency.
 */

import {
  decayConfigSchema,
  freshnessDecayConfigSchema,
  type DecayConfig,
  type FreshnessDecayConfig,
} from '@trapmap/contracts';

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
 * Environment variable names for freshness decay configuration.
 */
const FRESHNESS_ENV_VARS = {
  volatileEnabled: 'TRAPMAP_FRESHNESS_VOLATILE_ENABLED',
  volatileHalfLifeDays: 'TRAPMAP_FRESHNESS_VOLATILE_HALF_LIFE_DAYS',
  volatileFloor: 'TRAPMAP_FRESHNESS_VOLATILE_FLOOR',
  versionedEnabled: 'TRAPMAP_FRESHNESS_VERSIONED_ENABLED',
  versionedMismatchMultiplier: 'TRAPMAP_FRESHNESS_VERSIONED_MISMATCH_MULTIPLIER',
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

/**
 * Load freshness decay configuration from environment variables.
 *
 * Defaults match freshnessDecayConfigSchema defaults.
 * Environment variables override defaults when set.
 *
 * @returns FreshnessDecayConfig with validated values
 */
export function loadFreshnessConfig(): FreshnessDecayConfig {
  return freshnessDecayConfigSchema.parse({
    evergreen: { enabled: false },
    versioned: {
      enabled: process.env[FRESHNESS_ENV_VARS.versionedEnabled] !== 'false',
      mode: 'step',
      matchMultiplier: 1.0,
      mismatchMultiplier: Number(
        process.env[FRESHNESS_ENV_VARS.versionedMismatchMultiplier] ?? 0.5,
      ),
    },
    volatile: {
      enabled: process.env[FRESHNESS_ENV_VARS.volatileEnabled] !== 'false',
      mode: 'exponential',
      halfLifeDays: Number(
        process.env[FRESHNESS_ENV_VARS.volatileHalfLifeDays] ?? 30,
      ),
      zeroDays: 90,
      floor: Number(process.env[FRESHNESS_ENV_VARS.volatileFloor] ?? 0.3),
    },
  });
}
