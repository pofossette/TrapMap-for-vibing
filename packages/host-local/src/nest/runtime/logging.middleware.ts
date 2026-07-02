import type { NestMiddleware } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { RequestContextService } from './request-context.service.js';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  use(req: FastifyRequest, res: FastifyReply, next: () => void): void {
    const start = Date.now();
    const responseTarget = (res.raw ?? (res as unknown as { on?: (event: string, cb: () => void) => void })) as {
      on?: (event: string, cb: () => void) => void;
    };

    responseTarget.on?.('finish', () => {
      const ctx = this.requestContext.get();
      const duration = Date.now() - start;
      const requestId = ctx?.requestId ?? '-';
      const traceId = ctx?.traceId ?? '-';
      const method = req.method;
      const url = req.url;
      const statusCode = (res as FastifyReply & { raw?: { statusCode?: number } }).statusCode
        ?? (res as FastifyReply & { raw?: { statusCode?: number } }).raw?.statusCode
        ?? 0;

      this.logger.log(`${method} ${url} ${statusCode} ${duration}ms [${requestId}] [${traceId}]`);
    });

    next();
  }
}
