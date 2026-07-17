import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { HOST_LOCAL_RUNTIME_TOKEN, type HostLocalRuntime } from '../runtime/host-runtime.js';

@Injectable()
export class CandidateProcessingService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(HOST_LOCAL_RUNTIME_TOKEN)
    private readonly runtime: HostLocalRuntime,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.runtime.processing.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.runtime.processing.close();
  }
}
