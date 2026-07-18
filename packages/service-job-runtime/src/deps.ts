import {
  type JobRuntimeDeps,
  type TaskHandler,
  createJobRuntimeModule,
} from '@trapmap/backend-core';

export type { JobRuntimeDeps } from '@trapmap/backend-core';

export interface JobRuntimePortDeps {
  queuePorts: JobRuntimeDeps['queuePorts'];
  auditLog: JobRuntimeDeps['auditLog'];
  taskHandlers?: TaskHandler<unknown>[];
  ownsWork?: boolean;
}

export function createJobRuntimeDeps(deps: JobRuntimePortDeps): JobRuntimeDeps {
  return {
    queuePorts: deps.queuePorts,
    auditLog: deps.auditLog,
    ...(deps.taskHandlers ? { taskHandlers: deps.taskHandlers } : {}),
    ...(deps.ownsWork !== undefined ? { ownsWork: deps.ownsWork } : {}),
  };
}

export function createJobRuntimeServiceModule(deps: JobRuntimeDeps) {
  return createJobRuntimeModule(deps);
}
