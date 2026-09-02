import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { buildHostLocalModule } from './app.composition.js';
import type { HostLocalRuntime } from './runtime/host-runtime.js';
import { HttpMetricsMiddleware } from './observability/index.js';
import { LoggingMiddleware } from './runtime/logging.middleware.js';
import { RequestContextMiddleware } from './runtime/request-context.middleware.js';

@Module({})
export class AppModule implements NestModule {
  static forRuntime(runtime: HostLocalRuntime) {
    const { imports, providers, exports } = buildHostLocalModule(runtime);
    return { module: AppModule, imports, providers, exports };
  }
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestContextMiddleware, HttpMetricsMiddleware, LoggingMiddleware)
      .forRoutes('*');
  }
}
