/**
 * Cron service module — composition seam.
 *
 * The service module exposes the owner bundle's full surface plus the
 * scheduler and the manual-trigger orchestration (immediate enqueue through
 * the async transport without advancing nextRunAt). Routes consume only this
 * module, keeping the transport and database wiring host-injected.
 */

import { InvocationError } from '@trapmap/backend-core';
import type {
  CronJob,
  CronJobCreateInput,
  CronJobStatusSnapshot,
  CronJobUpdateInput,
} from '@trapmap/contracts';
import type { CronOwnerBundle } from './pg-ports.js';
import type { CronScheduler, CronSchedulerTransport } from './scheduler.js';

export interface CronServiceDeps {
  bundle: CronOwnerBundle;
  transport: CronSchedulerTransport;
  scheduler: CronScheduler;
  clock?: () => Date;
}

export interface CronServiceModule {
  create(input: CronJobCreateInput): Promise<CronJob>;
  list(): Promise<CronJob[]>;
  getById(id: string): Promise<CronJob | null>;
  update(id: string, input: CronJobUpdateInput): Promise<CronJob | null>;
  pause(id: string): Promise<CronJob | null>;
  resume(id: string): Promise<CronJob | null>;
  delete(id: string): Promise<boolean>;
  trigger(id: string): Promise<CronJob>;
  statusSnapshots(): Promise<CronJobStatusSnapshot[]>;
  scheduler: CronScheduler;
}

export function createCronServiceModule(deps: CronServiceDeps): CronServiceModule {
  const clock = deps.clock ?? (() => new Date());

  async function trigger(id: string): Promise<CronJob> {
    const job = await deps.bundle.getById(id);
    if (!job) throw InvocationError.notFound('Cron job not found');
    const now = clock();
    await deps.transport.task.enqueue(job.taskType, job.payload, {
      dedupeKey: `cron:${job.id}:trigger:${now.getTime()}`,
    });
    const updated = await deps.bundle.trigger(id, now);
    return updated ?? job;
  }

  return {
    create: (input) => deps.bundle.create(input),
    list: () => deps.bundle.list(),
    getById: (id) => deps.bundle.getById(id),
    update: (id, input) => deps.bundle.update(id, input),
    pause: (id) => deps.bundle.pause(id),
    resume: (id) => deps.bundle.resume(id),
    delete: (id) => deps.bundle.delete(id),
    trigger,
    statusSnapshots: () => deps.bundle.statusSnapshots(),
    scheduler: deps.scheduler,
  };
}
