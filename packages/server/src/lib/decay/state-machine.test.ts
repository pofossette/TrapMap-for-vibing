import { beforeEach, describe, expect, it } from 'vitest';

import type { DecayConfig } from '@trapmap/contracts';
import {
  DEFAULT_DECAY_CONFIG,
  type DecayableEntry,
  computeDecayState,
  isTerminalDecayState,
  requiresAttention,
  validateDecayConfig,
} from './state-machine.js';

/**
 * Helper to create test entries with defaults.
 */
function makeEntry(overrides: Partial<DecayableEntry> = {}): DecayableEntry {
  return {
    lastVerifiedAt: new Date().toISOString(),
    decayState: 'active',
    supersededById: null,
    ...overrides,
  };
}

/**
 * Helper to create a fixed date N days ago from a reference date.
 */
function daysAgo(days: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() - days);
  return result;
}

describe('computeDecayState', () => {
  const config: DecayConfig = { ...DEFAULT_DECAY_CONFIG };
  const now = new Date('2024-06-15T12:00:00Z');

  describe('superseded entries', () => {
    it('returns "superseded" when supersededById is set regardless of age', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(5, now).toISOString(), // Very fresh
        decayState: 'active',
        supersededById: 'entry_newer_version',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('superseded');
    });

    it('returns "superseded" when decayState is already "superseded"', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(5, now).toISOString(),
        decayState: 'superseded',
        supersededById: null,
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('superseded');
    });

    it('prioritizes supersededById over decayState check', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(365, now).toISOString(), // Very old
        decayState: 'active',
        supersededById: 'replacement_entry',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('superseded');
    });
  });

  describe('age-based transitions', () => {
    it('returns "active" when age < reviewDueDays', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(50, now).toISOString(), // 50 days < 90
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('active');
    });

    it('returns "review-due" when age >= reviewDueDays but < staleDays', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(100, now).toISOString(), // 100 days: 90 <= 100 < 180
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('review-due');
    });

    it('returns "stale" when age >= staleDays but < expireDays', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(200, now).toISOString(), // 200 days: 180 <= 200 < 365
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('stale');
    });

    it('returns "expired" when age >= expireDays', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(400, now).toISOString(), // 400 days >= 365
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('expired');
    });

    it('returns "expired" exactly at expireDays boundary', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(365, now).toISOString(), // Exactly 365 days
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('expired');
    });

    it('returns "stale" exactly at staleDays boundary', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(180, now).toISOString(), // Exactly 180 days
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('stale');
    });

    it('returns "review-due" exactly at reviewDueDays boundary', () => {
      const entry = makeEntry({
        lastVerifiedAt: daysAgo(90, now).toISOString(), // Exactly 90 days
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, now);
      expect(result.decayState).toBe('review-due');
    });
  });

  describe('null entry handling', () => {
    it('returns "active" for null entry', () => {
      const result = computeDecayState(null, config, now);
      expect(result.decayState).toBe('active');
    });

    it('returns computed timestamp for null entry', () => {
      const result = computeDecayState(null, config, now);
      expect(result.decayStateComputedAt).toBe(now.toISOString());
    });
  });

  describe('timestamp handling', () => {
    it('uses now parameter for deterministic testing', () => {
      const fixedNow = new Date('2024-01-15T10:30:00Z');
      const entry = makeEntry({
        lastVerifiedAt: '2023-10-15T10:30:00Z', // Exactly 92 days before fixedNow
        decayState: 'active',
      });

      const result = computeDecayState(entry, config, fixedNow);
      expect(result.decayState).toBe('review-due');
      expect(result.decayStateComputedAt).toBe('2024-01-15T10:30:00.000Z');
    });

    it('defaults to current time when now not provided', () => {
      const entry = makeEntry({
        lastVerifiedAt: new Date().toISOString(),
        decayState: 'active',
      });

      const result = computeDecayState(entry, config);
      expect(result.decayState).toBe('active');
      // Result should have a valid ISO timestamp
      expect(result.decayStateComputedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

describe('DEFAULT_DECAY_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_DECAY_CONFIG.reviewDueDays).toBe(90);
    expect(DEFAULT_DECAY_CONFIG.staleDays).toBe(180);
    expect(DEFAULT_DECAY_CONFIG.expireDays).toBe(365);
    expect(DEFAULT_DECAY_CONFIG.enabled).toBe(false);
  });

  it('has valid threshold ordering', () => {
    expect(validateDecayConfig(DEFAULT_DECAY_CONFIG)).toBe(true);
  });
});

describe('isTerminalDecayState', () => {
  it('returns true for "superseded"', () => {
    expect(isTerminalDecayState('superseded')).toBe(true);
  });

  it('returns true for "expired"', () => {
    expect(isTerminalDecayState('expired')).toBe(true);
  });

  it('returns false for "active"', () => {
    expect(isTerminalDecayState('active')).toBe(false);
  });

  it('returns false for "review-due"', () => {
    expect(isTerminalDecayState('review-due')).toBe(false);
  });

  it('returns false for "stale"', () => {
    expect(isTerminalDecayState('stale')).toBe(false);
  });
});

describe('requiresAttention', () => {
  it('returns false for "active"', () => {
    expect(requiresAttention('active')).toBe(false);
  });

  it('returns true for "review-due"', () => {
    expect(requiresAttention('review-due')).toBe(true);
  });

  it('returns true for "stale"', () => {
    expect(requiresAttention('stale')).toBe(true);
  });

  it('returns true for "expired"', () => {
    expect(requiresAttention('expired')).toBe(true);
  });

  it('returns true for "superseded"', () => {
    expect(requiresAttention('superseded')).toBe(true);
  });
});

describe('validateDecayConfig', () => {
  it('returns true for valid config with correct ordering', () => {
    const validConfig: DecayConfig = {
      reviewDueDays: 90,
      staleDays: 180,
      expireDays: 365,
      enabled: true,
    };
    expect(validateDecayConfig(validConfig)).toBe(true);
  });

  it('returns true when all thresholds are equal', () => {
    const equalConfig: DecayConfig = {
      reviewDueDays: 100,
      staleDays: 100,
      expireDays: 100,
      enabled: false,
    };
    expect(validateDecayConfig(equalConfig)).toBe(true);
  });

  it('returns false when reviewDueDays > staleDays', () => {
    const invalidConfig: DecayConfig = {
      reviewDueDays: 200,
      staleDays: 100,
      expireDays: 365,
      enabled: false,
    };
    expect(validateDecayConfig(invalidConfig)).toBe(false);
  });

  it('returns false when staleDays > expireDays', () => {
    const invalidConfig: DecayConfig = {
      reviewDueDays: 90,
      staleDays: 400,
      expireDays: 365,
      enabled: false,
    };
    expect(validateDecayConfig(invalidConfig)).toBe(false);
  });
});

describe('custom config scenarios', () => {
  it('works with aggressive short thresholds', () => {
    const aggressiveConfig: DecayConfig = {
      reviewDueDays: 7,
      staleDays: 14,
      expireDays: 30,
      enabled: true,
    };
    const now = new Date('2024-06-15T12:00:00Z');

    const freshEntry = makeEntry({
      lastVerifiedAt: daysAgo(3, now).toISOString(),
    });
    const reviewNeeded = makeEntry({
      lastVerifiedAt: daysAgo(10, now).toISOString(),
    });
    const staleEntry = makeEntry({
      lastVerifiedAt: daysAgo(20, now).toISOString(),
    });
    const expiredEntry = makeEntry({
      lastVerifiedAt: daysAgo(35, now).toISOString(),
    });

    expect(computeDecayState(freshEntry, aggressiveConfig, now).decayState).toBe('active');
    expect(computeDecayState(reviewNeeded, aggressiveConfig, now).decayState).toBe('review-due');
    expect(computeDecayState(staleEntry, aggressiveConfig, now).decayState).toBe('stale');
    expect(computeDecayState(expiredEntry, aggressiveConfig, now).decayState).toBe('expired');
  });

  it('works with extended long thresholds', () => {
    const extendedConfig: DecayConfig = {
      reviewDueDays: 365,
      staleDays: 730,
      expireDays: 1095,
      enabled: true,
    };
    const now = new Date('2024-06-15T12:00:00Z');

    const activeEntry = makeEntry({
      lastVerifiedAt: daysAgo(200, now).toISOString(),
    });
    const reviewNeeded = makeEntry({
      lastVerifiedAt: daysAgo(400, now).toISOString(),
    });
    const staleEntry = makeEntry({
      lastVerifiedAt: daysAgo(800, now).toISOString(),
    });
    const expiredEntry = makeEntry({
      lastVerifiedAt: daysAgo(1200, now).toISOString(),
    });

    expect(computeDecayState(activeEntry, extendedConfig, now).decayState).toBe('active');
    expect(computeDecayState(reviewNeeded, extendedConfig, now).decayState).toBe('review-due');
    expect(computeDecayState(staleEntry, extendedConfig, now).decayState).toBe('stale');
    expect(computeDecayState(expiredEntry, extendedConfig, now).decayState).toBe('expired');
  });
});
