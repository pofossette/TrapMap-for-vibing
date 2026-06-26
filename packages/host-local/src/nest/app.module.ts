import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { loadServerConfigBridge, SERVER_CONFIG_TOKEN } from './config/config-bridge.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { KnowledgeReadModule } from './knowledge-read/knowledge-read.module.js';
import { RequestContextMiddleware } from './runtime/request-context.middleware.js';
import { RequestContextService } from './runtime/request-context.service.js';
import { LoggingMiddleware } from './runtime/logging.middleware.js';

/**
 * Root application module for the Nest host.
 *
 * Phase 1 scope:
 * - ConfigModule bridges packages/server/src/config.ts (authoritative env schema)
 * - GatewayModule provides the pilot HTTP controllers (knowledge-read only)
 * - KnowledgeReadModule provides the KnowledgeReadPort (in-process or remote)
 * - Runtime middleware: request context, logging, trace propagation
 *
 * identity-access is NOT imported — it is deferred due to auth contract drift.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadServerConfigBridge],
    }),
    GatewayModule,
  ],
  providers: [
    RequestContextService,
    {
      provide: SERVER_CONFIG_TOKEN,
      useFactory: () => loadServerConfigBridge().serverConfig,
    },
  ],
  exports: [RequestContextService, SERVER_CONFIG_TOKEN],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, LoggingMiddleware).forRoutes('*');
  }
}
