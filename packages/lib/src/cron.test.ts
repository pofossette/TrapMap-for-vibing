import { describe, expect, it } from 'vitest';

import { cronNextRun, cronValidate } from './cron.js';

describe('cronNextRun', () => {
  it('computes the next run in a fixed timezone', () => {
    const next = cronNextRun('0 9 * * *', new Date('2026-03-01T00:00:00Z'), 'Asia/Shanghai');
    expect(next.toISOString()).toBe('2026-03-01T01:00:00.000Z');
  });

  it('skips across the week boundary', () => {
    const next = cronNextRun('0 0 * * 1', new Date('2026-03-01T12:00:00Z'), 'UTC');
    expect(next.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('skips across the month boundary', () => {
    const next = cronNextRun('0 0 1 * *', new Date('2026-03-15T12:00:00Z'), 'UTC');
    expect(next.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('returns the following occurrence when from exactly matches the schedule', () => {
    const next = cronNextRun('*/5 * * * *', new Date('2026-03-01T10:00:00Z'), 'UTC');
    expect(next.toISOString()).toBe('2026-03-01T10:05:00.000Z');
  });

  it('strips sub-second precision from the result', () => {
    const next = cronNextRun('*/5 * * * *', new Date('2026-03-01T10:00:00.500Z'), 'UTC');
    expect(next.toISOString()).toBe('2026-03-01T10:05:00.000Z');
  });

  it('throws on an invalid expression', () => {
    expect(() => cronNextRun('not-a-cron', new Date('2026-03-01T00:00:00Z'), 'UTC')).toThrow();
  });

  it('throws on an invalid timezone', () => {
    expect(() => cronNextRun('0 9 * * *', new Date('2026-03-01T00:00:00Z'), 'Not/AZone')).toThrow();
  });
});

describe('cronValidate', () => {
  it('accepts a valid five-part expression', () => {
    expect(cronValidate('*/15 * * * *')).toBe(true);
  });

  it('rejects invalid expressions', () => {
    expect(cronValidate('not-a-cron')).toBe(false);
    expect(cronValidate('61 * * * *')).toBe(false);
    expect(cronValidate('')).toBe(false);
  });
});
