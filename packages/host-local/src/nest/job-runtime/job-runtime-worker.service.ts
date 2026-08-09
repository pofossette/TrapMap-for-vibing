import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { JobRuntimeDeps, TaskConsumerHandle } from '@trapmap/backend-core';

import { JOB_RUNTIME_WORKER_CONFIG } from './job-runtime.tokens.js';

export type JobRuntimeWorkerDeps = Pick<JobRuntimeDeps, 'queuePorts' | 'taskHandlers' | 'ownsWork'>;

@Injectable()
export class JobRuntimeWorkerService implements OnModuleInit, OnModuleDestroy {
  private consumer: TaskConsumerHandle | null = null;
  private runPromise: Promise<void> | null = null;

  constructor(
    @Inject(JOB_RUNTIME_WORKER_CONFIG)
    private readonly deps: JobRuntimeWorkerDeps,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.consumer) return;
    const createConsumer = this.deps.queuePorts.task.createConsumer;
    if (!createConsumer) {
      throw new Error('host-local job-runtime requires a task queue consumer');
    }
    this.consumer = await createConsumer({
      handlers: this.deps.taskHandlers ?? [],
      ownsWork: this.deps.ownsWork ?? true,
    });
    if (this.deps.ownsWork ?? true) {
      this.runPromise = this.consumer.run();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.consumer) return;
    await this.consumer.stop();
    if (this.runPromise) await this.runPromise;
    this.consumer = null;
    this.runPromise = null;
  }
}
