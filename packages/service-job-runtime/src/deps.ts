import {
  createJobRuntimeModule,
  type JobRuntimeDeps,
  type TaskHandler,
} from '@trapmap/backend-core';
import type { JobRuntimeOutboxHandler } from './outbox-worker.js';

export type { JobRuntimeDeps } from '@trapmap/backend-core';

export interface JobRuntimePortDeps {
  queuePorts: JobRuntimeDeps['queuePorts'];
  auditLog: JobRuntimeDeps['auditLog'];
  taskHandlers?: TaskHandler<unknown>[];
  ownsWork?: boolean;
  outboxHandlers?: JobRuntimeOutboxHandler[];
}

export type JobRuntimeServiceDeps = JobRuntimeDeps & Pick<JobRuntimePortDeps, 'outboxHandlers'>;

export function createJobRuntimeDeps(deps: JobRuntimePortDeps): JobRuntimeServiceDeps {
  return {
    queuePorts: deps.queuePorts,
    auditLog: deps.auditLog,
    ...(deps.taskHandlers ? { taskHandlers: deps.taskHandlers } : {}),
    ...(deps.ownsWork !== undefined ? { ownsWork: deps.ownsWork } : {}),
    ...(deps.outboxHandlers ? { outboxHandlers: deps.outboxHandlers } : {}),
  };
}

export function createJobRuntimeServiceModule(deps: JobRuntimeDeps) {
  return createJobRuntimeModule(deps);
}
