import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import type { CronScheduler } from '@trapmap/service-cron';

import { CRON_SCHEDULER } from './cron.tokens.js';

/**
 * Host lifecycle owner for the cron scheduler.
 *
 * The scheduler instance itself (with its poll loop and task-queue
 * transport) is composed once in `HostLocalServices`; this provider only
 * binds its lifecycle to the Nest host: start on boot, stop on shutdown.
 */
@Injectable()
export class CronSchedulerProvider implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(CRON_SCHEDULER) private readonly scheduler: CronScheduler) {}

  async onModuleInit(): Promise<void> {
    if (this.scheduler.isRunning()) return;
    await this.scheduler.run();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.scheduler.isRunning()) return;
    await this.scheduler.stop();
  }
}
