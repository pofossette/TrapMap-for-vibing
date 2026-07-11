import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { HOST_LOCAL_CONFIG_TOKEN } from '../config/index.js';
import type { HostLocalConfig } from '../config/index.js';
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

    if ('header' in res && typeof res.header === 'function') {
      res.header(this.config.runtime.requestIdHeader, ctx.requestId);
      if (ctx.traceParent) {
        res.header(ctx.traceHeaderName, ctx.traceParent);
      }
    } else if (res.raw && typeof res.raw.setHeader === 'function') {
      res.raw.setHeader(this.config.runtime.requestIdHeader, ctx.requestId);
      if (ctx.traceParent) {
        res.raw.setHeader(ctx.traceHeaderName, ctx.traceParent);
      }
    }

    this.requestContext.run(ctx, next);
  }
}
