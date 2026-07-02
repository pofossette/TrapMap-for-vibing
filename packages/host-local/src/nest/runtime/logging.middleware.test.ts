import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { LoggingMiddleware } from './logging.middleware.js';
import { RequestContextService } from './request-context.service.js';

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
          { method: 'GET', url: '/health' } as never,
          {
            raw: {
              statusCode: 204,
              on(event: string, cb: () => void) {
                if (event === 'finish') {
                  finishHandler = cb;
                }
              },
            },
          } as never,
          vi.fn(),
        );
      },
    );

    expect(finishHandler).toBeTypeOf('function');
    finishHandler?.();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('GET /health 204'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[req-1] [trace-1]'));
  });

  it('does not depend on raw when reply itself exposes on', () => {
    const service = new RequestContextService();
    const middleware = new LoggingMiddleware(service);
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    let finishHandler: (() => void) | undefined;

    middleware.use(
      { method: 'GET', url: '/metrics' } as never,
      {
        statusCode: 200,
        on(event: string, cb: () => void) {
          if (event === 'finish') {
            finishHandler = cb;
          }
        },
      } as never,
      vi.fn(),
    );

    expect(finishHandler).toBeTypeOf('function');
    finishHandler?.();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('GET /metrics 200'));
  });
});
