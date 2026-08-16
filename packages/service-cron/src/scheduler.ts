/**
 * Cron scheduler — due-job poller.
 *
 * The scheduler owns no business logic and no SQL beyond what the owner
 * bundle exposes: every poll tick claims due enabled jobs (the bundle uses
 * FOR UPDATE SKIP LOCKED), enqueues each as an async task through the
 * injected transport, then records success (advance nextRunAt) or failure
 * (keep nextRunAt so the job stays due for the next tick).
 *
 * Execution semantics: at-least-once enqueue, deduplicated by
 * `cron:{jobId}:{scheduledAt}` at the task_queue level, with the
 * applyRunSuccess guard (`next_run_at <= now`) preventing double bookkeeping
 * when two scheduler instances race on the same job. Disabled jobs are never
 * claimed. `ownsWork = false` keeps a standby instance polling nothing.
 */

import { computeNextRun } from '@trapmap/backend-core';
import type { TaskEnqueueOptions } from '@trapmap/backend-core';
import type { CronJob } from '@trapmap/contracts';
import type { CronOwnerBundle } from './pg-ports.js';

export interface CronSchedulerTransport {
  task: {
    enqueue<T>(type: string, payload: T, options?: TaskEnqueueOptions): Promise<unknown>;
  };
}

export interface CronSchedulerConfig {
  bundle: CronOwnerBundle;
  transport: CronSchedulerTransport;
  pollIntervalMs?: number;
  ownsWork?: boolean;
  clock?: () => Date;
}

export interface CronScheduler {
  run(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  ownsWork(): boolean;
  tick(): Promise<number>;
}

const CLAIM_BATCH_SIZE = 20;

export function createCronScheduler(config: CronSchedulerConfig): CronScheduler {
  const pollIntervalMs = config.pollIntervalMs ?? 1000;
  const ownsWork = config.ownsWork ?? true;
  const clock = config.clock ?? (() => new Date());
  const dedupeKey = (job: CronJob): string => `cron:${job.id}:${job.nextRunAt ?? 'none'}`;

  let running = false;
  let loop: Promise<void> | null = null;

  const processClaimed = async (jobs: CronJob[], now: Date): Promise<void> => {
    for (const job of jobs) {
      try {
        await config.transport.task.enqueue(job.taskType, job.payload, {
          dedupeKey: dedupeKey(job),
        });
        await config.bundle.applyRunSuccess(job.id, {
          nextRunAt: computeNextRun(job.schedule, now, job.timezone),
          lastRunAt: now,
        });
      } catch (error) {
        await config.bundle.applyRunFailure(job.id, {
          lastRunAt: now,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const tick = async (): Promise<number> => {
    if (!ownsWork) return 0;
    const now = clock();
    const claimed = await config.bundle.claimDue(now, CLAIM_BATCH_SIZE);
    await processClaimed(claimed, now);
    return claimed.length;
  };

  return {
    async run() {
      if (running || !ownsWork) return;
      running = true;
      loop = (async () => {
        while (running) {
          try {
            await tick();
          } catch (error) {
            console.error('[cron-scheduler] tick failed, retrying on next poll:', error);
          }
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      })();
    },

    async stop() {
      running = false;
      await loop;
    },

    isRunning: () => running,
    ownsWork: () => ownsWork,

    tick,
  };
}
