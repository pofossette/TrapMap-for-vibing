import { Module } from '@nestjs/common';

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
  controllers: [KnowledgeReadController],
})
export class GatewayModule {}
