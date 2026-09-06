import type { NestMiddleware } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatLogForStdout, type LogEntry } from '@trapmap/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { RequestContextService } from './request-context.service.js';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  use(req: FastifyRequest, res: FastifyReply, next: () => void): void {
    const start = Date.now();
    const requestContext = this.requestContext.get();
    const responseTarget = (res.raw ?? res) as {
      on?: (event: string, cb: () => void) => void;
    };

    responseTarget.on?.('finish', () => {
      const duration = Date.now() - start;
      const requestId = requestContext?.requestId ?? 'unknown';
      const traceId = requestContext?.traceId ?? undefined;
      const method = req.method;
      const url = req.url;
      const statusCode =
        (res as FastifyReply & { raw?: { statusCode?: number } }).statusCode ??
        (res as FastifyReply & { raw?: { statusCode?: number } }).raw?.statusCode ??
        0;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'host-local',
        environment: process.env.NODE_ENV ?? 'development',
        eventCategory: 'request',
        eventName: 'request.completed',
        requestId,
        ...(traceId ? { traceId } : {}),
        ...(requestContext?.operationId ? { operationId: requestContext.operationId } : {}),
        ...(requestContext?.causationId ? { causationId: requestContext.causationId } : {}),
        ownerSurface: 'runtime-seam',
        method,
        route: requestContext?.route ?? url,
        statusCode,
        latencyMs: duration,
        message: 'Request completed',
      };

      this.logger.log(formatLogForStdout(entry));
    });

    next();
  }
}
