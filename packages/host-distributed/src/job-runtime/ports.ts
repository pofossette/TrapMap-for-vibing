import type { JobRuntimeDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '@trapmap/host-distributed/shared/ports.js';

export function createJobRuntimeDeps(ports: ServicePortImplementations): JobRuntimeDeps {
  return {
    queuePorts: ports.queuePorts,
    auditLog: ports.auditLog,
  };
}
