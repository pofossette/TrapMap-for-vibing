import { Module } from '@nestjs/common';

import {
  type CronServiceDeps,
  type CronServiceModule,
  createCronServiceModule,
} from '@trapmap/service-cron';

import type { HostLocalRuntime } from '../runtime/host-runtime.js';
import { CRON_PORT, CRON_SCHEDULER } from './cron.tokens.js';
import { CronSchedulerProvider } from './cron-scheduler.provider.js';

/**
 * Nest module for the cron bounded context.
 *
 * The cron service module (port) and scheduler lifecycle are registered
 * here, but the service package's business RouteDefs are NOT mounted on
 * the monolith public port: cron mutations gate on a client-supplied
 * `x-trapmap-actor-id`, which the monolith cannot verify. The monolith
 * instead exposes the cron surface as session-guarded `/v1/cron/*`
 * gateway routes (actor resolved from the session context), mirroring the
 * distributed gateway. This module only provides the port token and binds
 * the scheduler's lifecycle (start on boot / stop on shutdown) to the host.
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class CronModule {
  static forDeps(deps: CronServiceDeps) {
    const port: CronServiceModule = createCronServiceModule(deps);
    return CronModule.options(port);
  }

  static forTesting(port: CronServiceModule) {
    return CronModule.options(port);
  }

  /**
   * Derive the cron service deps from the composed monolith runtime. The
   * deps (and the port built from them) must be shared with the gateway
   * aggregation, so this helper is the single composition seam.
   */
  static cronDepsForRuntime(runtime: HostLocalRuntime): CronServiceDeps {
    const asyncTransport = runtime.services.asyncTransport;
    if (!asyncTransport) {
      throw new Error('host-local cron module requires the async task transport');
    }
    return {
      bundle: runtime.services.cronOwnerBundle,
      transport: { task: asyncTransport.task },
      scheduler: runtime.services.cronScheduler,
    };
  }

  private static options(port: CronServiceModule) {
    return {
      module: CronModule,
      controllers: [],
      providers: [
        {
          provide: CRON_PORT,
          useValue: port,
        },
        {
          provide: CRON_SCHEDULER,
          useValue: port.scheduler,
        },
        CronSchedulerProvider,
      ],
      exports: [CRON_PORT, CRON_SCHEDULER],
      global: true,
    };
  }
}
