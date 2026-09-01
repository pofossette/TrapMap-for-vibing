import { describe, expect, it } from 'vitest';

import type { CronJob } from '@trapmap/contracts';

import {
  applyRunFailure,
  applyRunSuccess,
  computeNextRun,
  createInitialNextRun,
  isDue,
  pauseJob,
  resumeJob,
} from '../../../src/cron/domain/schedule.js';

const NOW = new Date('2026-03-01T12:00:00.000Z');

function job(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job_01',
    name: 'digest',
    schedule: '0 9 * * *',
    timezone: 'UTC',
    taskType: 'digest',
    payload: {},
    enabled: true,
    nextRunAt: '2026-03-02T09:00:00.000Z',
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeNextRun', () => {
  it('returns the next occurrence after the reference instant', () => {
    expect(computeNextRun('0 9 * * *', NOW, 'UTC').toISOString()).toBe('2026-03-02T09:00:00.000Z');
  });

  it('throws on an invalid schedule', () => {
    expect(() => computeNextRun('not-a-cron', NOW, 'UTC')).toThrow();
  });
});

describe('createInitialNextRun', () => {
  it('schedules the first run from the reference instant', () => {
    expect(createInitialNextRun('0 9 * * *', NOW, 'UTC').toISOString()).toBe(
      '2026-03-02T09:00:00.000Z',
    );
  });

  it('throws on an invalid schedule', () => {
    expect(() => createInitialNextRun('not-a-cron', NOW, 'UTC')).toThrow();
  });
});

describe('isDue', () => {
  it('is due when enabled and nextRunAt is in the past', () => {
    expect(isDue(job({ nextRunAt: '2026-03-01T09:00:00.000Z' }), NOW)).toBe(true);
  });

  it('is due when nextRunAt equals now', () => {
    expect(isDue(job({ nextRunAt: '2026-03-01T12:00:00.000Z' }), NOW)).toBe(true);
  });

  it('is not due when nextRunAt is in the future', () => {
    expect(isDue(job(), NOW)).toBe(false);
  });

  it('is not due when the job is disabled', () => {
    expect(isDue(job({ enabled: false }), NOW)).toBe(false);
  });

  it('is not due when nextRunAt is null', () => {
    expect(isDue(job({ nextRunAt: null }), NOW)).toBe(false);
  });
});

describe('applyRunSuccess', () => {
  it('advances nextRunAt past now and records the successful run', () => {
    const updated = applyRunSuccess(job(), NOW);
    expect(updated).toEqual(
      job({
        nextRunAt: '2026-03-02T09:00:00.000Z',
        lastRunAt: '2026-03-01T12:00:00.000Z',
        lastStatus: 'succeeded',
        lastError: null,
        runCount: 1,
      }),
    );
  });

  it('clears a previous error', () => {
    const updated = applyRunSuccess(
      job({ lastStatus: 'failed', lastError: 'boom', runCount: 2 }),
      NOW,
    );
    expect(updated.lastStatus).toBe('succeeded');
    expect(updated.lastError).toBeNull();
    expect(updated.runCount).toBe(3);
  });
});

describe('applyRunFailure', () => {
  it('keeps nextRunAt and records the failed run', () => {
    const updated = applyRunFailure(job(), NOW, 'worker exploded');
    expect(updated).toEqual(
      job({
        lastRunAt: '2026-03-01T12:00:00.000Z',
        lastStatus: 'failed',
        lastError: 'worker exploded',
        runCount: 1,
      }),
    );
  });
});

describe('pauseJob / resumeJob', () => {
  it('pauseJob only flips enabled off', () => {
    expect(pauseJob(job())).toEqual(job({ enabled: false }));
  });

  it('resumeJob re-enables and reschedules nextRunAt from now', () => {
    const updated = resumeJob(job({ enabled: false, nextRunAt: '2026-03-05T09:00:00.000Z' }), NOW);
    expect(updated.enabled).toBe(true);
    expect(updated.nextRunAt).toBe('2026-03-02T09:00:00.000Z');
  });
});
