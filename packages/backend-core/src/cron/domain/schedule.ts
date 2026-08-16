/**
 * Cron scheduling domain — pure run-state rules.
 *
 * Zero framework / DB / SQL imports: schedule math is delegated to the
 * `@trapmap/lib` croner wrapper, and every function is a pure
 * (state, instant) -> state transition so the service layer can enforce the
 * same rules inside any storage owner.
 */

import type { CronJob } from '@trapmap/contracts';
import { cronNextRun } from '@trapmap/lib';

/** Next occurrence of `schedule` strictly after `from`, in `timezone`. */
export function computeNextRun(schedule: string, from: Date, timezone: string): Date {
  return cronNextRun(schedule, from, timezone);
}

/** First scheduled run instant for a freshly created job. */
export function createInitialNextRun(schedule: string, from: Date, timezone: string): Date {
  return computeNextRun(schedule, from, timezone);
}

/** Whether an enabled job should run now, according to its persisted nextRunAt. */
export function isDue(job: CronJob, now: Date): boolean {
  return job.enabled && job.nextRunAt !== null && new Date(job.nextRunAt) <= now;
}

/** Advance the schedule past `now` and record a successful run. */
export function applyRunSuccess(job: CronJob, now: Date): CronJob {
  return {
    ...job,
    nextRunAt: computeNextRun(job.schedule, now, job.timezone).toISOString(),
    lastRunAt: now.toISOString(),
    lastStatus: 'succeeded',
    lastError: null,
    runCount: job.runCount + 1,
  };
}

/** Record a failed run without advancing nextRunAt, so the job stays due. */
export function applyRunFailure(job: CronJob, now: Date, error: string): CronJob {
  return {
    ...job,
    lastRunAt: now.toISOString(),
    lastStatus: 'failed',
    lastError: error,
    runCount: job.runCount + 1,
  };
}

/** Disable the job without touching its schedule state. */
export function pauseJob(job: CronJob): CronJob {
  return { ...job, enabled: false };
}

/** Re-enable the job and reschedule its next run from `now`. */
export function resumeJob(job: CronJob, now: Date): CronJob {
  return {
    ...job,
    enabled: true,
    nextRunAt: computeNextRun(job.schedule, now, job.timezone).toISOString(),
  };
}
