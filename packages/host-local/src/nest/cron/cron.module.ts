import { Module } from '@nestjs/common';

import { createNestAdapter } from '@trapmap/backend-core';
import {
  type CronServiceDeps,
  type CronServiceModule,
  type CronScheduler,
  createCronServiceModule,
  createCronRouteDefs,
} from '@trapmap/service-cron';

import { AuthGuard } from '../runtime/auth.guard.js';
import { serviceRouteDefsForMonolith } from '../runtime/monolith-route-defs.js';
import type { HostLocalRuntime } from '../runtime/host-runtime.js';
import { CronSchedulerProvider } from './cron-scheduler.provider.js';
import { CRON_PORT, CRON_SCHEDULER } from './cron.tokens.js';

/**
 * Nest module for the cron bounded context.
 *
 * The service package's RouteDef list is registered through the shared
 * Nest adapter (probe routes excluded, monolith owns /health) and guarded
 * by the host session guard. The scheduler provider binds the composed
 * scheduler's lifecycle (start on boot / stop on shutdown) to the host.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class CronModule {
  static forDeps(deps: CronServiceDeps) {
    const port: CronServiceModule = createCronServiceModule(deps);
    return CronModule.options(port, deps.scheduler);
  }

  static forTesting(port: CronServiceModule) {
    return CronModule.options(port, port.scheduler);
  }

  /**
   * Runtime wiring for the monolith: every cron dep is composed on
   * `HostLocalServices`, so the module is built from the runtime alone.
   */
  static forRuntime(runtime: HostLocalRuntime) {
    const asyncTransport = runtime.services.asyncTransport;
    if (!asyncTransport) {
      throw new Error('host-local cron module requires the async task transport');
    }
    return CronModule.forDeps({
      bundle: runtime.services.cronOwnerBundle,
      transport: { task: asyncTransport.task },
      scheduler: runtime.services.cronScheduler,
    });
  }

  private static options(port: CronServiceModule, scheduler: CronScheduler) {
    return {
      module: CronModule,
      controllers: [
        createNestAdapter(serviceRouteDefsForMonolith(createCronRouteDefs(port)), port, {
          guards: [AuthGuard],
        }),
      ],
      providers: [
        {
          provide: CRON_PORT,
          useValue: port,
        },
        {
          provide: CRON_SCHEDULER,
          useValue: scheduler,
        },
        CronSchedulerProvider,
      ],
      exports: [CRON_PORT, CRON_SCHEDULER],
      global: true,
    };
  }
}
