import { describe, expect, it } from 'vitest';

import type { DecayMeta } from '@trapmap/contracts';
import {
  DEFAULT_FRESHNESS_CONFIG,
  computeFreshnessMultiplier,
  exponentialDecay,
  linearDecay,
  stepDecay,
} from './freshness.js';

describe('exponentialDecay', () => {
  it('returns 1.0 at age 0', () => {
    expect(exponentialDecay(0, 30, 0.3)).toBe(1.0);
  });

  it('returns ~0.65 at half-life', () => {
    // At halfLifeDays, decayFactor = 0.5, so result = 0.3 + 0.7 * 0.5 = 0.65
    expect(exponentialDecay(30, 30, 0.3)).toBeCloseTo(0.65, 2);
  });

  it('respects floor at high age', () => {
    expect(exponentialDecay(1000, 30, 0.3)).toBeGreaterThanOrEqual(0.3);
    expect(exponentialDecay(1000, 30, 0.3)).toBeLessThan(0.31);
  });

  it('never goes below floor', () => {
    for (const age of [0, 10, 30, 100, 365, 1000]) {
      expect(exponentialDecay(age, 30, 0.3)).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('handles negative age by clamping to 0', () => {
    expect(exponentialDecay(-10, 30, 0.3)).toBe(1.0);
  });
});

describe('linearDecay', () => {
  it('returns 1.0 at age 0', () => {
    expect(linearDecay(0, 90, 0.3)).toBe(1.0);
  });

  it('reaches floor at zeroDays', () => {
    expect(linearDecay(90, 90, 0.3)).toBeCloseTo(0.3, 10);
  });

  it('linear interpolation at midpoint', () => {
    // At 45 days with zeroDays=90, floor=0.3: 1 - 45 * (0.7/90) = 1 - 0.35 = 0.65
    expect(linearDecay(45, 90, 0.3)).toBeCloseTo(0.65, 2);
  });

  it('never goes below floor', () => {
    expect(linearDecay(200, 90, 0.3)).toBe(0.3);
  });

  it('handles negative age by clamping to 0', () => {
    expect(linearDecay(-10, 90, 0.3)).toBe(1.0);
  });
});

describe('stepDecay', () => {
  it('returns matchMultiplier when matches is true', () => {
    expect(stepDecay(true)).toBe(1.0);
    expect(stepDecay(true, 0.9, 0.3)).toBe(0.9);
  });

  it('returns mismatchMultiplier when matches is false', () => {
    expect(stepDecay(false)).toBe(0.5);
    expect(stepDecay(false, 0.9, 0.3)).toBe(0.3);
  });

  it('uses default values when not specified', () => {
    expect(stepDecay(true)).toBe(1.0);
    expect(stepDecay(false)).toBe(0.5);
  });
});

describe('computeFreshnessMultiplier', () => {
  const now = new Date('2026-05-02T00:00:00Z');

  it('returns 1.0 for null decayMeta', () => {
    const result = computeFreshnessMultiplier({ decayMeta: null }, DEFAULT_FRESHNESS_CONFIG, now);
    expect(result).toBe(1.0);
  });

  it('returns 1.0 for evergreen freshness type', () => {
    const meta: DecayMeta = {
      lastVerifiedAt: '2025-05-02T00:00:00Z', // 1 year ago
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'evergreen',
    };
    const result = computeFreshnessMultiplier({ decayMeta: meta }, DEFAULT_FRESHNESS_CONFIG, now);
    expect(result).toBe(1.0);
  });

  it('returns 1.0 for volatile entry with age 0', () => {
    const meta: DecayMeta = {
      lastVerifiedAt: '2026-05-02T00:00:00Z', // Today
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };
    const result = computeFreshnessMultiplier({ decayMeta: meta }, DEFAULT_FRESHNESS_CONFIG, now);
    expect(result).toBe(1.0);
  });

  it('returns < 1.0 for volatile entry with age > 0', () => {
    const meta: DecayMeta = {
      lastVerifiedAt: '2026-04-02T00:00:00Z', // 30 days ago
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };
    const result = computeFreshnessMultiplier({ decayMeta: meta }, DEFAULT_FRESHNESS_CONFIG, now);
    expect(result).toBeLessThan(1.0);
    expect(result).toBeGreaterThanOrEqual(0.3); // floor
  });

  it('returns 1.0 when volatile decay is disabled', () => {
    const meta: DecayMeta = {
      lastVerifiedAt: '2025-05-02T00:00:00Z', // 1 year ago
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };
    const config = {
      ...DEFAULT_FRESHNESS_CONFIG,
      volatile: { ...DEFAULT_FRESHNESS_CONFIG.volatile, enabled: false },
    };
    const result = computeFreshnessMultiplier({ decayMeta: meta }, config, now);
    expect(result).toBe(1.0);
  });

  it('returns 1.0 for versioned freshness type (version context not implemented)', () => {
    const meta: DecayMeta = {
      lastVerifiedAt: '2025-05-02T00:00:00Z',
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'versioned',
    };
    const result = computeFreshnessMultiplier({ decayMeta: meta }, DEFAULT_FRESHNESS_CONFIG, now);
    expect(result).toBe(1.0);
  });

  it('applies versioned decay when version context is provided', () => {
    const meta: DecayMeta = {
      lastVerifiedAt: '2025-05-02T00:00:00Z',
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'versioned',
    };

    expect(
      computeFreshnessMultiplier({ decayMeta: meta }, DEFAULT_FRESHNESS_CONFIG, now, {
        versionMatches: true,
      }),
    ).toBe(1.0);
    expect(
      computeFreshnessMultiplier({ decayMeta: meta }, DEFAULT_FRESHNESS_CONFIG, now, {
        versionMatches: false,
      }),
    ).toBe(0.5);
  });

  it('applies exponential decay correctly for volatile entries', () => {
    // 30 days old with halfLife=30 should give ~0.65
    const meta: DecayMeta = {
      lastVerifiedAt: '2026-04-02T00:00:00Z',
      decayState: 'active',
      supersededById: null,
      decayStateComputedAt: '2026-05-02T00:00:00Z',
      freshnessType: 'volatile',
    };
    const result = computeFreshnessMultiplier({ decayMeta: meta }, DEFAULT_FRESHNESS_CONFIG, now);
    expect(result).toBeCloseTo(0.65, 1);
  });
});
