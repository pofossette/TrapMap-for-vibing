import { describe, expect, it } from 'vitest';

import { formatDate, nowIso, timestamp } from './time.js';

describe('nowIso', () => {
  it('returns an ISO-8601 UTC timestamp around the current time', () => {
    const before = Date.now();
    const value = nowIso();
    const after = Date.now();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const parsed = Date.parse(value);
    expect(parsed).toBeGreaterThanOrEqual(before - 1);
    expect(parsed).toBeLessThanOrEqual(after + 1);
  });
});

describe('timestamp', () => {
  it('normalizes a parseable timestamp to ISO-8601 UTC', () => {
    expect(timestamp('2026-08-08T10:00:00+08:00')).toBe('2026-08-08T02:00:00.000Z');
  });

  it('returns already-normalized ISO strings unchanged', () => {
    expect(timestamp('2026-08-08T02:00:00.000Z')).toBe('2026-08-08T02:00:00.000Z');
  });

  it('returns invalid input unchanged (backfill safety)', () => {
    expect(timestamp('not-a-date')).toBe('not-a-date');
    expect(timestamp('')).toBe('');
  });
});

describe('formatDate', () => {
  it('formats YYYY-MM-DD in local time with zero padding', () => {
    expect(formatDate(new Date(2026, 7, 8))).toBe('2026-08-08');
    expect(formatDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});
