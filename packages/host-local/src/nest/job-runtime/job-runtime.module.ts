import { Module } from '@nestjs/common';

import type { JobRuntimeDeps, JobRuntimePort } from '@trapmap/backend-core';
import { createJobRuntimeModule, createNestAdapter } from '@trapmap/backend-core';
import { createJobRuntimeRouteDefs } from '@trapmap/service-job-runtime';

import { AuthGuard } from '../runtime/auth.guard.js';
import { serviceRouteDefsForMonolith } from '../runtime/monolith-route-defs.js';
import { JOB_RUNTIME_PORT, JOB_RUNTIME_WORKER_CONFIG } from './job-runtime.tokens.js';
import { JobRuntimeWorkerService } from './job-runtime-worker.service.js';

/**
 * Nest module for the job-runtime bounded context.
 *
 * Phase 2 cutover: the Nest module directly consumes the backend-core
 * factory. This module is pure runtime substrate — it owns no business
 * state machine and accepts handler-registry injection from other
 * contexts via the task-queue transport the host wires in.
 *
 * The service package's RouteDef list is registered through the shared
 * Nest adapter (probe routes excluded, monolith owns /health) and guarded
 * by the host session guard.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class JobRuntimeModule {
  static forDeps(deps: JobRuntimeDeps) {
    const port: JobRuntimePort = createJobRuntimeModule(deps);

    return {
      module: JobRuntimeModule,
      controllers: [
        createNestAdapter(serviceRouteDefsForMonolith(createJobRuntimeRouteDefs(port)), port, {
          guards: [AuthGuard],
        }),
      ],
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
      controllers: [
        createNestAdapter(serviceRouteDefsForMonolith(createJobRuntimeRouteDefs(port)), port, {
          guards: [AuthGuard],
        }),
      ],
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
