import { Module } from '@nestjs/common';

import type { JobRuntimeDeps, JobRuntimePort } from '@trapmap/backend-core';
import { createJobRuntimeModule } from '@trapmap/backend-core';

import { JobRuntimeWorkerService } from './job-runtime-worker.service.js';
import { JOB_RUNTIME_PORT, JOB_RUNTIME_WORKER_CONFIG } from './job-runtime.tokens.js';

/**
 * Nest module for the job-runtime bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory. This module is pure runtime substrate — it owns no business
 * state machine and accepts handler-registry injection from other
 * contexts via the task-queue transport the host wires in.
 */
@Module({})
export class JobRuntimeModule {
  static forDeps(deps: JobRuntimeDeps) {
    const port: JobRuntimePort = createJobRuntimeModule(deps);

    return {
      module: JobRuntimeModule,
      providers: [
        {
          provide: JOB_RUNTIME_PORT,
          useValue: port,
        },
        {
          provide: JOB_RUNTIME_WORKER_CONFIG,
          useValue: {
            queuePorts: deps.queuePorts,
            taskHandlers: deps.taskHandlers ?? [],
            ownsWork: deps.ownsWork ?? true,
          },
        },
        JobRuntimeWorkerService,
      ],
      exports: [JOB_RUNTIME_PORT],
      global: true,
    };
  }

  static forTesting(port: JobRuntimePort) {
    return {
      module: JobRuntimeModule,
      providers: [
        {
          provide: JOB_RUNTIME_PORT,
          useValue: port,
        },
      ],
      exports: [JOB_RUNTIME_PORT],
      global: true,
    };
  }
}
