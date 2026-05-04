import { describe, expect, it } from 'vitest';

import {
  computeDefaultReviewBy,
  isReviewOverdue,
  isStaleVerification,
  validateMaintenanceMeta,
} from './model.js';

describe('isReviewOverdue', () => {
  it('returns false for null reviewBy', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    expect(isReviewOverdue(null, now)).toBe(false);
  });

  it('returns false for future date', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    const future = new Date('2026-06-01T00:00:00.000Z').toISOString();
    expect(isReviewOverdue(future, now)).toBe(false);
  });

  it('returns true for past date', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    const past = new Date('2025-12-01T00:00:00.000Z').toISOString();
    expect(isReviewOverdue(past, now)).toBe(true);
  });
});

describe('isStaleVerification', () => {
  it('returns true for null lastVerifiedAt (never verified)', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    expect(isStaleVerification(null, 180, now)).toBe(true);
  });

  it('returns false for recent lastVerifiedAt within staleDays', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    const recent = new Date('2025-12-01T00:00:00.000Z').toISOString(); // ~45 days ago
    expect(isStaleVerification(recent, 180, now)).toBe(false);
  });

  it('returns true for old lastVerifiedAt exceeding staleDays', () => {
    const now = new Date('2026-01-15T00:00:00.000Z');
    const old = new Date('2025-01-01T00:00:00.000Z').toISOString(); // ~380 days ago
    expect(isStaleVerification(old, 180, now)).toBe(true);
  });
});

describe('computeDefaultReviewBy', () => {
  it('returns valid ISO timestamp', () => {
    const result = computeDefaultReviewBy(90);
    const parsed = new Date(result);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('date is approximately N days in the future', () => {
    const before = Date.now();
    const result = computeDefaultReviewBy(90);
    const after = Date.now();
    const parsed = new Date(result).getTime();

    const minExpected = before + 90 * 86400000;
    const maxExpected = after + 90 * 86400000;
    expect(parsed).toBeGreaterThanOrEqual(minExpected);
    expect(parsed).toBeLessThanOrEqual(maxExpected);
  });
});

describe('validateMaintenanceMeta', () => {
  it('accepts valid meta with maintainer and reviewBy', () => {
    const meta = {
      maintainer: { id: 'user_1', handle: 'alice', securityLevel: 5 },
      reviewBy: '2026-06-01T00:00:00.000Z',
    };
    const result = validateMaintenanceMeta(meta);
    expect(result.maintainer).not.toBeNull();
    expect(result.reviewBy).toBe('2026-06-01T00:00:00.000Z');
  });

  it('accepts null fields', () => {
    const meta = {
      maintainer: null,
      reviewBy: null,
    };
    const result = validateMaintenanceMeta(meta);
    expect(result.maintainer).toBeNull();
    expect(result.reviewBy).toBeNull();
  });

  it('throws on invalid data', () => {
    expect(() => validateMaintenanceMeta('not-an-object')).toThrow();
  });
});
