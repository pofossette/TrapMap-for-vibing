import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

import type { ServerConfig } from '@trapmap/server/config.js';

import { SERVER_CONFIG_TOKEN } from '../config/config-bridge.js';
import {
  RequestContextService,
  extractRequestContext,
} from './request-context.service.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    private readonly requestContext: RequestContextService,
    @Inject(SERVER_CONFIG_TOKEN) private readonly config: ServerConfig,
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
