import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachRuntimeMetricsRoute } from '../../src/shared/observability.js';
import { attachRuntimeTelemetry } from '../../src/shared/telemetry.js';

describe('attachRuntimeMetricsRoute', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('serves prometheus metrics for distributed worker processes', async () => {
    const app = Fastify();
    attachRuntimeMetricsRoute(app);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('trapmap_process_resident_memory_bytes');

    await app.close();
  });

  it('creates a server root span when traceparent is absent', async () => {
    vi.stubEnv('OTEL_DISABLED', 'true');
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
    vi.spyOn(trace, 'getTracer').mockReturnValue({ startSpan } as Tracer);
    vi.spyOn(propagation, 'extract').mockReturnValue(otelContext.active());

    const app = Fastify();
    attachRuntimeTelemetry(app, 'knowledge-write');
    app.get('/internal/health', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/internal/health' });

    expect(response.statusCode).toBe(200);
    expect(startSpan).toHaveBeenCalledTimes(1);
    expect(span.end).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
