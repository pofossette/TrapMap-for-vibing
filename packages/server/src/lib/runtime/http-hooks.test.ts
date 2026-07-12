import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { context as otelContext, propagation, trace } from '@opentelemetry/api';

import { registerHttpRequestHooks } from './http-hooks.js';

describe('registerHttpRequestHooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a server root span when traceparent is absent', async () => {
    const span = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      spanContext: () => ({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: 1,
        isRemote: false,
      }),
    };
    const startSpan = vi.fn(() => span);
    vi.spyOn(trace, 'getTracer').mockReturnValue({ startSpan } as never);
    vi.spyOn(propagation, 'extract').mockReturnValue(otelContext.active());

    const app = Fastify();
    (app as typeof app & { skillShareer: unknown }).skillShareer = {
      tracing: undefined,
    };
    registerHttpRequestHooks({
      app,
      config: {
        runtime: {
          requestIdHeader: 'x-request-id',
          traceHeaderName: 'traceparent',
        },
      } as never,
      runtimeServiceName: 'server',
      runtimeMode: 'local-agent',
    });
    app.get('/health', async () => ({ ok: true }));

    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(startSpan).toHaveBeenCalledTimes(1);
    expect(startSpan.mock.calls[0]?.[2]).toBeDefined();
    expect(span.end).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
