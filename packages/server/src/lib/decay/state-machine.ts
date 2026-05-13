/**
 * Pure decay state machine for knowledge lifecycle management.
 *
 * This module provides:
 * - Deterministic decay state computation based on age and config
 * - Superseded entry detection (always returns 'superseded')
 * - Null-safe handling for entries without decay metadata
 *
 * The state machine is pure (no side effects) and uses injected
 * timestamps for deterministic testing.
 */

import { type DecayConfig, type DecayState } from '@trapmap/contracts';

/**
 * Entry interface for decay state computation.
 * Represents the minimal data needed from KnowledgeRecord or SkillArtifactRecord.
 */
export interface DecayableEntry {
  /** When this entry was last verified by a human */
  lastVerifiedAt: string;
  /** Current decay state (may be overridden by age computation) */
  decayState: DecayState;
  /** ID of the entry that supersedes this one, if any */
  supersededById: string | null;
}

/**
 * Default decay configuration.
 * Matches decayConfigSchema defaults: 90/180/365 days, disabled.
 */
export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  reviewDueDays: 90,
  staleDays: 180,
  expireDays: 365,
  enabled: false,
};

/**
 * Compute the decay state for an entry based on age and configuration.
 *
 * @param entry - The decayable entry (or null for default active state)
 * @param config - Decay configuration with thresholds
 * @param now - Current timestamp (defaults to new Date() for production use)
 * @returns Computed decay state and computation timestamp
 *
 * State transitions (in priority order):
 * 1. null entry → 'active' (default for new entries)
 * 2. supersededById !== null → 'superseded' (regardless of age)
 * 3. decayState === 'superseded' → 'superseded' (sticky)
 * 4. age >= expireDays → 'expired'
 * 5. age >= staleDays → 'stale'
 * 6. age >= reviewDueDays → 'review-due'
 * 7. else → 'active'
 *
 * The function is pure and deterministic when `now` is provided.
 */
export function computeDecayState(
  entry: DecayableEntry | null,
  config: DecayConfig,
  now: Date = new Date(),
): { decayState: DecayState; decayStateComputedAt: string } {
  const computedAt = now.toISOString();

  // Null entry defaults to active state
  if (entry === null) {
    return {
      decayState: 'active',
      decayStateComputedAt: computedAt,
    };
  }

  // Superseded entries stay superseded regardless of age
  if (entry.supersededById !== null) {
    return {
      decayState: 'superseded',
      decayStateComputedAt: computedAt,
    };
  }

  // Sticky superseded state
  if (entry.decayState === 'superseded') {
    return {
      decayState: 'superseded',
      decayStateComputedAt: computedAt,
    };
  }

  // Compute age in days from last verification
  const verifiedAt = new Date(entry.lastVerifiedAt);
  const ageMs = now.getTime() - verifiedAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Check thresholds in order of severity (most severe first)
  if (ageDays >= config.expireDays) {
    return {
      decayState: 'expired',
      decayStateComputedAt: computedAt,
    };
  }

  if (ageDays >= config.staleDays) {
    return {
      decayState: 'stale',
      decayStateComputedAt: computedAt,
    };
  }

  if (ageDays >= config.reviewDueDays) {
    return {
      decayState: 'review-due',
      decayStateComputedAt: computedAt,
    };
  }

  return {
    decayState: 'active',
    decayStateComputedAt: computedAt,
  };
}

/**
 * Type guard to check if a decay state is terminal (won't auto-recover).
 * Superseded and expired are terminal states requiring manual intervention.
 */
export function isTerminalDecayState(state: DecayState): boolean {
  return state === 'superseded' || state === 'expired';
}

/**
 * Type guard to check if a decay state requires human attention.
 * Review-due, stale, expired, and superseded all need human action.
 */
export function requiresAttention(state: DecayState): boolean {
  return state !== 'active';
}

/**
 * Validate that a decay config has valid threshold ordering.
 * reviewDueDays <= staleDays <= expireDays must hold.
 */
export function validateDecayConfig(config: DecayConfig): boolean {
  return config.reviewDueDays <= config.staleDays && config.staleDays <= config.expireDays;
}
