import type { CronJob } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { CronOwnerBundle } from './pg-ports.js';
import { type CronSchedulerTransport, createCronScheduler } from './scheduler.js';

type MemoryJob = CronJob & { claimed: boolean };

function createMemoryBundle(jobs: CronJob[]): {
  bundle: CronOwnerBundle;
  store: Map<string, MemoryJob>;
} {
  const store = new Map<string, MemoryJob>(jobs.map((job) => [job.id, { ...job, claimed: false }]));
  const snapshot = (job: MemoryJob): CronJob => {
    const { claimed: _claimed, ...rest } = job;
    return rest;
  };
  return {
    store,
    bundle: {
      async claimDue(now) {
        const due = [...store.values()]
          .filter(
            (job) =>
              job.enabled &&
              !job.claimed &&
              job.nextRunAt !== null &&
              new Date(job.nextRunAt) <= now,
          )
          .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!));
        for (const job of due) job.claimed = true;
        return due.map(snapshot);
      },
      async applyRunSuccess(id, { nextRunAt, lastRunAt }) {
        const job = store.get(id);
        if (!job || !job.enabled) return;
        if (job.nextRunAt !== null && new Date(job.nextRunAt) > lastRunAt) return;
        job.nextRunAt = nextRunAt.toISOString();
        job.lastRunAt = lastRunAt.toISOString();
        job.lastStatus = 'succeeded';
        job.lastError = null;
        job.runCount += 1;
        job.claimed = false;
      },
      async applyRunFailure(id, { lastRunAt, error }) {
        const job = store.get(id);
        if (!job) return;
        job.lastRunAt = lastRunAt.toISOString();
        job.lastStatus = 'failed';
        job.lastError = error;
        job.runCount += 1;
        job.claimed = false;
      },
    } as CronOwnerBundle,
  };
}

function createTransport(): {
  enqueue: ReturnType<typeof vi.fn>;
  transport: CronSchedulerTransport;
} {
  const enqueue = vi.fn(async () => 'task_1');
  return { enqueue, transport: { task: { enqueue } } };
}

const NOW = new Date('2026-08-16T04:00:00.000Z');

async function waitForCondition(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition not met within timeout');
}

function jobFixture(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'cron_job000000000001',
    name: 'nightly purge',
    schedule: '0 3 * * *',
    timezone: 'UTC',
    taskType: 'purge-expired',
    payload: { days: 30 },
    enabled: true,
    nextRunAt: '2026-08-16T03:00:00.000Z',
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('service-cron scheduler', () => {
  it('delivers a due job to the task transport with a scheduled-at dedupe key', async () => {
    const job = jobFixture();
    const { bundle, store } = createMemoryBundle([job]);
    const { enqueue, transport } = createTransport();
    const scheduler = createCronScheduler({ bundle, transport, clock: () => NOW });

    const claimed = await scheduler.tick();
    expect(claimed).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(
      'purge-expired',
      { days: 30 },
      { dedupeKey: `cron:${job.id}:${job.nextRunAt}` },
    );

    const updated = store.get(job.id)!;
    expect(updated.lastStatus).toBe('succeeded');
    expect(updated.runCount).toBe(1);
    expect(new Date(updated.nextRunAt!).getTime()).toBeGreaterThan(NOW.getTime());
    expect(updated.nextRunAt).not.toBe(job.nextRunAt);
  });

  it('keeps next_run_at on enqueue failure so the job is retried on the next tick', async () => {
    const job = jobFixture();
    const { bundle, store } = createMemoryBundle([job]);
    const enqueue = vi.fn(async () => {
      throw new Error('queue down');
    });
    const scheduler = createCronScheduler({
      bundle,
      transport: { task: { enqueue } },
      clock: () => NOW,
    });

    await scheduler.tick();
    const failed = store.get(job.id)!;
    expect(failed.lastStatus).toBe('failed');
    expect(failed.lastError).toBe('queue down');
    expect(failed.nextRunAt).toBe(job.nextRunAt);
    expect(failed.runCount).toBe(1);

    await scheduler.tick();
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(store.get(job.id)!.runCount).toBe(2);
  });

  it('never claims a paused (disabled) job', async () => {
    const job = jobFixture({ enabled: false });
    const { bundle } = createMemoryBundle([job]);
    const { enqueue, transport } = createTransport();
    const scheduler = createCronScheduler({ bundle, transport, clock: () => NOW });

    await expect(scheduler.tick()).resolves.toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('skips jobs that are not due yet', async () => {
    const job = jobFixture({ nextRunAt: '2026-08-16T05:00:00.000Z' });
    const { bundle } = createMemoryBundle([job]);
    const { enqueue, transport } = createTransport();
    const scheduler = createCronScheduler({ bundle, transport, clock: () => NOW });

    await expect(scheduler.tick()).resolves.toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('claims a due job only once across concurrent scheduler instances', async () => {
    const job = jobFixture();
    const { bundle } = createMemoryBundle([job]);
    const firstEnqueue = vi.fn(async () => 'task_1');
    const secondEnqueue = vi.fn(async () => 'task_1');
    const first = createCronScheduler({
      bundle,
      transport: { task: { enqueue: firstEnqueue } },
      clock: () => NOW,
    });
    const second = createCronScheduler({
      bundle,
      transport: { task: { enqueue: secondEnqueue } },
      clock: () => NOW,
    });

    const [a, b] = await Promise.all([first.tick(), second.tick()]);
    expect(a + b).toBe(1);
    expect(firstEnqueue).toHaveBeenCalledTimes(1);
    expect(secondEnqueue).toHaveBeenCalledTimes(0);
  });

  it('advances a job that became due again after a successful run', async () => {
    const job = jobFixture();
    const { bundle, store } = createMemoryBundle([job]);
    const { enqueue, transport } = createTransport();
    const scheduler = createCronScheduler({ bundle, transport, clock: () => NOW });

    await scheduler.tick();
    const nextRunAt = store.get(job.id)!.nextRunAt!;
    const laterClock = () => new Date(new Date(nextRunAt).getTime() + 1000);
    const later = createCronScheduler({ bundle, transport, clock: laterClock });

    await later.tick();
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(store.get(job.id)!.runCount).toBe(2);
  });

  it('runs and stops gracefully with a polling loop', async () => {
    const job = jobFixture();
    const { bundle } = createMemoryBundle([job]);
    const { enqueue, transport } = createTransport();
    const scheduler = createCronScheduler({
      bundle,
      transport,
      pollIntervalMs: 10,
      clock: () => NOW,
    });

    await scheduler.run();
    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.ownsWork()).toBe(true);

    await scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not poll when ownsWork is false', async () => {
    const job = jobFixture();
    const { bundle } = createMemoryBundle([job]);
    const { enqueue, transport } = createTransport();
    const scheduler = createCronScheduler({
      bundle,
      transport,
      ownsWork: false,
      clock: () => NOW,
    });

    await scheduler.run();
    expect(scheduler.isRunning()).toBe(false);
    await expect(scheduler.tick()).resolves.toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('survives a transient claimDue failure and keeps polling on the next tick', async () => {
    const job = jobFixture();
    const { bundle } = createMemoryBundle([job]);
    const { enqueue, transport } = createTransport();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let claimCalls = 0;
    const flakyBundle: CronOwnerBundle = {
      ...bundle,
      async claimDue(now, limit) {
        claimCalls += 1;
        if (claimCalls === 1) {
          throw new Error('connection reset');
        }
        return bundle.claimDue(now, limit);
      },
    };
    const scheduler = createCronScheduler({
      bundle: flakyBundle,
      transport,
      pollIntervalMs: 10,
      clock: () => NOW,
    });

    await scheduler.run();
    expect(scheduler.isRunning()).toBe(true);

    await waitForCondition(() => enqueue.mock.calls.length >= 1);
    expect(claimCalls).toBeGreaterThanOrEqual(2);
    expect(errorSpy).toHaveBeenCalledWith(
      '[cron-scheduler] tick failed, retrying on next poll:',
      expect.any(Error),
    );
    expect(scheduler.isRunning()).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);

    await scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
    errorSpy.mockRestore();
  });
});
