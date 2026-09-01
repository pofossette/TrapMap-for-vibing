import { Logger } from '@nestjs/common';
import { logEntrySchema } from '@trapmap/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { LoggingMiddleware } from '../../../src/nest/runtime/logging.middleware.js';
import { RequestContextService } from '../../../src/nest/runtime/request-context.service.js';

describe('LoggingMiddleware', () => {
  it('logs completed requests when Fastify reply exposes raw.on', () => {
    const service = new RequestContextService();
    const middleware = new LoggingMiddleware(service);
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    let finishHandler: (() => void) | undefined;

    service.run(
      {
        requestId: 'req-1',
        traceId: 'trace-1',
        traceHeaderName: 'traceparent',
        method: 'GET',
        route: '/health',
      },
      () => {
        middleware.use(
          { method: 'GET', url: '/health' } as FastifyRequest,
          {
            raw: {
              statusCode: 204,
              on(event: string, cb: () => void) {
                if (event === 'finish') {
                  finishHandler = cb;
                }
              },
            },
          } as FastifyReply,
          vi.fn(),
        );
      },
    );

    expect(finishHandler).toBeTypeOf('function');
    finishHandler?.();

    const [serialized] = logSpy.mock.calls[0] ?? [];
    const entry = logEntrySchema.parse(JSON.parse(String(serialized)));
    expect(entry).toMatchObject({
      eventName: 'request.completed',
      requestId: 'req-1',
      traceId: 'trace-1',
      method: 'GET',
      statusCode: 204,
    });
  });

  it('does not depend on raw when reply itself exposes on', () => {
    const service = new RequestContextService();
    const middleware = new LoggingMiddleware(service);
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    let finishHandler: (() => void) | undefined;

    middleware.use(
      { method: 'GET', url: '/metrics' } as FastifyRequest,
      {
        statusCode: 200,
        on(event: string, cb: () => void) {
          if (event === 'finish') {
            finishHandler = cb;
          }
        },
      } as FastifyReply,
      vi.fn(),
    );

    expect(finishHandler).toBeTypeOf('function');
    finishHandler?.();

    const [serialized] = logSpy.mock.calls[0] ?? [];
    expect(logEntrySchema.parse(JSON.parse(String(serialized)))).toMatchObject({
      eventName: 'request.completed',
      method: 'GET',
      statusCode: 200,
    });
  });
});
