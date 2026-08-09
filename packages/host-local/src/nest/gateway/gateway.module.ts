import { Module } from '@nestjs/common';

import { HOST_LOCAL_RUNTIME_TOKEN, type HostLocalRuntime } from '../runtime/host-runtime.js';
import { CandidateReviewController } from './candidate-review.controller.js';
import { KnowledgeReadController } from './knowledge-read.controller.js';

/**
 * Gateway module: external-facing HTTP controllers.
 *
 * Phase 1 pilot: knowledge-read controller only.
 * identity-access is deferred (auth contract drift).
 *
 * The KnowledgeReadPort is provided globally by KnowledgeReadModule.
 */
@Module({
  controllers: [KnowledgeReadController, CandidateReviewController],
})
export class GatewayModule {}
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic-module pattern (static factory is the idiomatic composition API)
export class GatewayRuntimeModule {
  static forRuntime(runtime: HostLocalRuntime) {
    return {
      module: GatewayRuntimeModule,
      providers: [
        {
          provide: HOST_LOCAL_RUNTIME_TOKEN,
          useValue: runtime,
        },
      ],
      exports: [HOST_LOCAL_RUNTIME_TOKEN],
      global: true,
    };
  }
}
