import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { HOST_LOCAL_CONFIG_TOKEN } from "@trapmap/host-local/nest/config/index.js";
import type { HostLocalConfig } from "@trapmap/host-local/nest/config/index.js";
import {
  RequestContextService,
  extractRequestContext,
} from './request-context.service.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    @Inject(HOST_LOCAL_CONFIG_TOKEN) private readonly config: HostLocalConfig,
  ) {}

  use(req: FastifyRequest, res: FastifyReply, next: () => void): void {
    const ctx = extractRequestContext(
      req.headers as Record<string, string | string[] | undefined>,
      {
        requestIdHeader: this.config.runtime.requestIdHeader,
        traceHeaderName: this.config.runtime.traceHeaderName,
      },
      {
        method: req.method,
        route: req.routeOptions?.url || req.url,
        existingId: req.id,
      },
    );

    res.header(this.config.runtime.requestIdHeader, ctx.requestId);
    if (ctx.traceId) {
      res.header(ctx.traceHeaderName, ctx.traceId);
    }

    this.requestContext.run(ctx, next);
  }
}
