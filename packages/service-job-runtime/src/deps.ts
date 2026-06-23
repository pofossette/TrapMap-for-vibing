import { createJobRuntimeModule, type JobRuntimeDeps } from '@trapmap/backend-core';

export { type JobRuntimeDeps } from '@trapmap/backend-core';

export interface JobRuntimePortDeps {
  queuePorts: JobRuntimeDeps['queuePorts'];
  auditLog: JobRuntimeDeps['auditLog'];
}

export function createJobRuntimeDeps(deps: JobRuntimePortDeps): JobRuntimeDeps {
  return {
    queuePorts: deps.queuePorts,
    auditLog: deps.auditLog,
  };
}

export function createJobRuntimeServiceModule(deps: JobRuntimeDeps) {
  return createJobRuntimeModule(deps);
}
