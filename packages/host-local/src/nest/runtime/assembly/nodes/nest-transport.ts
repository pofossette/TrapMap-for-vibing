import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
/**
 * nest-transport node (D4 transport plugin, Phase 2 pilot).
 *
 * Consumes the composed {@link HostLocalRuntime} from the assembly and builds
 * the exact same Nest/Fastify application surface as the legacy AppModule
 * wiring, via {@link AppModule.forRuntime}. It uses AppModule.forRuntime(runtime)
 * (rather than threading the individual D2 service-node ports) so the Phase 2
 * pilot guarantees behavior-identical module/controller/provider composition;
 * the service nodes still register their D2 ports on the context so Phase 3
 * can thread them through when the infra services (audit/task queue/retrieval
 * engine/judgement nodes) land.
 */
import { defineNode } from '@trapmap/assembly';

import { AppModule } from '../../../app.module.js';
import { AllExceptionFilter } from '../../exception.filter.js';
import type { HostLocalRuntime } from '../../host-runtime.js';
import { RequestContextService } from '../../request-context.service.js';

export interface NestTransportConfig {
  host?: string;
  port?: number;
}

export const nestTransportNode = defineNode<NestTransportConfig>({
  id: 'nest-transport',
  provides: 'httpSurface',
  inject: ['hostLocalRuntime'],
  topology: 'embedded',
  async apply(ctx, config) {
    const runtime = ctx.get('hostLocalRuntime') as HostLocalRuntime | undefined;
    if (!runtime) {
      throw new Error('nest-transport node requires hostLocalRuntime');
    }

    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule.forRuntime(runtime),
      new FastifyAdapter(),
      { logger: ['error', 'warn', 'log'] },
    );

    const requestContext = app.get(RequestContextService);
    app.useGlobalFilters(new AllExceptionFilter(requestContext));

    const port = config.port ?? 4000;
    const host = config.host ?? '0.0.0.0';

    await app.listen(port, host);

    ctx.provide('httpSurface', app);
    return () => app.close();
  },
});

/** Token under which the built Nest app is exposed on the assembly context. */
export const HTTP_SURFACE_SERVICE = 'httpSurface';
