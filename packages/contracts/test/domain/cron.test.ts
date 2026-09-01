import { describe, expect, it } from 'vitest';

import {
  cronJobCreateInputSchema,
  cronJobSchema,
  cronJobStatusSnapshotSchema,
  cronJobUpdateInputSchema,
} from '../../src/domain/cron.js';

const VALID_JOB = {
  id: 'job_01',
  name: 'daily digest',
  schedule: '0 9 * * *',
  timezone: 'Asia/Shanghai',
  taskType: 'digest',
  payload: { teamId: 'team_01' },
  enabled: true,
  nextRunAt: '2026-03-02T01:00:00.000Z',
  lastRunAt: null,
  lastStatus: null,
  lastError: null,
  runCount: 0,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
} as const;

describe('cronJobSchema', () => {
  it('accepts a full valid job record', () => {
    expect(cronJobSchema.parse(VALID_JOB)).toEqual(VALID_JOB);
  });

  it('accepts every CronRunOutcome value for lastStatus', () => {
    for (const lastStatus of ['succeeded', 'failed', 'skipped'] as const) {
      const parsed = cronJobSchema.parse({ ...VALID_JOB, lastStatus, lastError: null });
      expect(parsed.lastStatus).toBe(lastStatus);
    }
  });

  it('rejects an unknown lastStatus', () => {
    expect(() => cronJobSchema.parse({ ...VALID_JOB, lastStatus: 'exploded' })).toThrow();
  });

  it('rejects an empty schedule', () => {
    expect(() => cronJobSchema.parse({ ...VALID_JOB, schedule: '' })).toThrow();
  });

  it('rejects a non-string schedule', () => {
    expect(() => cronJobSchema.parse({ ...VALID_JOB, schedule: 123 })).toThrow();
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => cronJobSchema.parse({ ...VALID_JOB, extra: true })).toThrow();
  });
});

describe('cronJobCreateInputSchema', () => {
  it('defaults timezone to UTC', () => {
    const input = cronJobCreateInputSchema.parse({
      name: 'digest',
      schedule: '0 9 * * *',
      taskType: 'digest',
    });
    expect(input.timezone).toBe('UTC');
  });

  it('defaults payload to an empty record and enabled to true', () => {
    const input = cronJobCreateInputSchema.parse({
      name: 'digest',
      schedule: '0 9 * * *',
      taskType: 'digest',
    });
    expect(input.payload).toEqual({});
    expect(input.enabled).toBe(true);
  });

  it('accepts an arbitrary payload record', () => {
    const input = cronJobCreateInputSchema.parse({
      name: 'digest',
      schedule: '0 9 * * *',
      taskType: 'digest',
      payload: { nested: { a: 1 }, list: [1, 2], flag: true },
    });
    expect(input.payload).toEqual({ nested: { a: 1 }, list: [1, 2], flag: true });
  });

  it('rejects a non-record payload', () => {
    const base = { name: 'digest', schedule: '0 9 * * *', taskType: 'digest' };
    expect(() => cronJobCreateInputSchema.parse({ ...base, payload: [1, 2] })).toThrow();
    expect(() => cronJobCreateInputSchema.parse({ ...base, payload: 'nope' })).toThrow();
    expect(() => cronJobCreateInputSchema.parse({ ...base, payload: null })).toThrow();
  });
});

describe('cronJobUpdateInputSchema', () => {
  it('accepts a partial update', () => {
    expect(cronJobUpdateInputSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it('rejects a schedule change without a timezone', () => {
    expect(() => cronJobUpdateInputSchema.parse({ schedule: '0 10 * * *' })).toThrow();
  });

  it('accepts a schedule change when timezone moves with it', () => {
    expect(cronJobUpdateInputSchema.parse({ schedule: '0 10 * * *', timezone: 'UTC' })).toEqual({
      schedule: '0 10 * * *',
      timezone: 'UTC',
    });
  });

  it('accepts a timezone-only update', () => {
    expect(cronJobUpdateInputSchema.parse({ timezone: 'Asia/Shanghai' })).toEqual({
      timezone: 'Asia/Shanghai',
    });
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => cronJobUpdateInputSchema.parse({ nope: 1 })).toThrow();
  });
});

describe('cronJobStatusSnapshotSchema', () => {
  it('parses a full snapshot', () => {
    const snapshot = cronJobStatusSnapshotSchema.parse({
      id: 'job_01',
      enabled: true,
      nextRunAt: '2026-03-02T01:00:00.000Z',
      lastRunAt: '2026-03-01T01:00:00.000Z',
      lastStatus: 'succeeded',
      lastError: null,
      runCount: 3,
    });
    expect(snapshot.runCount).toBe(3);
  });

  it('rejects an unknown lastStatus', () => {
    expect(() =>
      cronJobStatusSnapshotSchema.parse({
        id: 'job_01',
        enabled: true,
        nextRunAt: null,
        lastRunAt: null,
        lastStatus: 'nope',
        lastError: null,
        runCount: 0,
      }),
    ).toThrow();
  });
});
