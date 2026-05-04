/**
 * Pure functions for freshness-based decay computation.
 *
 * This module provides:
 * - Exponential decay: multiplier halves every halfLifeDays
 * - Linear decay: multiplier decreases linearly until reaching floor
 * - Step decay: binary multiplier based on condition
 *
 * All functions are pure and deterministic for testing.
 */

import type { DecayMeta, FreshnessDecayConfig } from '@trapmap/contracts';

/**
 * Compute exponential decay multiplier.
 *
 * Formula: floor + (1 - floor) * (0.5 ^ (ageDays / halfLifeDays))
 *
 * @param ageDays - Age of entry in days
 * @param halfLifeDays - Days for multiplier to halve (distance to floor)
 * @param floor - Minimum multiplier (default 0.3)
 * @returns Multiplier in [floor, 1.0]
 */
export function exponentialDecay(ageDays: number, halfLifeDays: number, floor: number): number {
  // Clamp age to non-negative
  const age = Math.max(0, ageDays);

  // Decay factor: 1.0 at age=0, approaches 0 as age→∞
  const decayFactor = 0.5 ** (age / halfLifeDays);

  // Interpolate between floor and 1.0
  return floor + (1 - floor) * decayFactor;
}

/**
 * Compute linear decay multiplier.
 *
 * Formula: max(floor, 1 - (ageDays / zeroDays) * (1 - floor))
 *
 * @param ageDays - Age of entry in days
 * @param zeroDays - Days until floor is reached
 * @param floor - Minimum multiplier
 * @returns Multiplier in [floor, 1.0]
 */
export function linearDecay(ageDays: number, zeroDays: number, floor: number): number {
  // Clamp age to non-negative
  const age = Math.max(0, ageDays);

  // Rate of decay per day
  const rate = (1 - floor) / zeroDays;

  // Linear decrease, floored at minimum
  return Math.max(floor, 1 - age * rate);
}

/**
 * Compute step decay multiplier.
 *
 * Binary multiplier based on condition match.
 * Used for versioned content where mismatch = immediate penalty.
 *
 * @param matches - Whether the version/context matches
 * @param matchMultiplier - Multiplier when matching (default 1.0)
 * @param mismatchMultiplier - Multiplier when not matching (default 0.5)
 * @returns matchMultiplier or mismatchMultiplier based on condition
 */
export function stepDecay(
  matches: boolean,
  matchMultiplier = 1.0,
  mismatchMultiplier = 0.5,
): number {
  return matches ? matchMultiplier : mismatchMultiplier;
}

/**
 * Entry interface for freshness multiplier computation.
 */
interface FreshnessEntry {
  decayMeta: DecayMeta | null;
}

/**
 * Default freshness decay configuration.
 * Matches freshnessDecayConfigSchema defaults.
 */
export const DEFAULT_FRESHNESS_CONFIG: FreshnessDecayConfig = {
  evergreen: { enabled: false },
  versioned: { enabled: true, mode: 'step', matchMultiplier: 1.0, mismatchMultiplier: 0.5 },
  volatile: { enabled: true, mode: 'exponential', halfLifeDays: 30, zeroDays: 90, floor: 0.3 },
};

/**
 * Compute freshness multiplier for an entry based on its type and age.
 *
 * @param entry - Entry with decay metadata
 * @param config - Freshness decay configuration
 * @param now - Current timestamp (defaults to new Date() for production)
 * @returns Multiplier in [0, 1.0] to apply to retrieval score
 *
 * Behavior by freshness type:
 * - evergreen: Always returns 1.0 (no decay)
 * - versioned: Returns 1.0 (version context not yet implemented)
 * - volatile: Computes decay based on age and configured curve
 */
export function computeFreshnessMultiplier(
  entry: FreshnessEntry,
  config: FreshnessDecayConfig,
  now: Date = new Date(),
): number {
  // Null decayMeta defaults to evergreen behavior
  if (entry.decayMeta === null) {
    return 1.0;
  }

  const freshnessType = entry.decayMeta.freshnessType ?? 'evergreen';

  // Route to type-specific computation
  switch (freshnessType) {
    case 'evergreen':
      return computeEvergreenMultiplier(config.evergreen);

    case 'versioned':
      // Versioned decay requires version context (Phase 51+)
      // For now, return 1.0 (no penalty) since we can't detect version mismatch
      return computeVersionedMultiplier(config.versioned);

    case 'volatile':
      return computeVolatileMultiplier(entry.decayMeta.lastVerifiedAt, config.volatile, now);

    default: {
      // Exhaustive check
      const _exhaustive: never = freshnessType;
      return 1.0;
    }
  }
}

/**
 * Compute multiplier for evergreen content.
 * Always returns 1.0 since evergreen content doesn't decay.
 */
function computeEvergreenMultiplier(_config: FreshnessDecayConfig['evergreen']): number {
  // Evergreen content never decays
  return 1.0;
}

/**
 * Compute multiplier for versioned content.
 * Currently returns 1.0 since version context is not yet available.
 */
function computeVersionedMultiplier(config: FreshnessDecayConfig['versioned']): number {
  // Version mismatch detection requires boundary context (Phase 51+)
  // For now, assume match (no penalty)
  if (!config.enabled) {
    return 1.0;
  }
  return stepDecay(true, config.matchMultiplier, config.mismatchMultiplier);
}

/**
 * Compute multiplier for volatile content based on age.
 */
function computeVolatileMultiplier(
  lastVerifiedAt: string,
  config: FreshnessDecayConfig['volatile'],
  now: Date,
): number {
  if (!config.enabled) {
    return 1.0;
  }

  // Compute age in days from last verification
  const verifiedAt = new Date(lastVerifiedAt);
  const ageMs = now.getTime() - verifiedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Apply configured decay mode
  if (config.mode === 'exponential') {
    return exponentialDecay(ageDays, config.halfLifeDays, config.floor);
  }
  return linearDecay(ageDays, config.zeroDays, config.floor);
}
