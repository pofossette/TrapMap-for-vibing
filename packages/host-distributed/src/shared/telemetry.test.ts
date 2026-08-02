import { context as otelContext, propagation, trace } from '@opentelemetry/api';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachRuntimeTelemetry } from './telemetry.js';

describe('attachRuntimeTelemetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('creates request spans even when OTel is disabled', async () => {
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
    vi.spyOn(trace, 'getTracer').mockReturnValue({ startSpan } as never);
    vi.spyOn(propagation, 'extract').mockReturnValue(otelContext.active());

    const app = Fastify();
    await attachRuntimeTelemetry(app, 'knowledge-write');
    app.get('/internal/health', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/internal/health' });

    expect(response.statusCode).toBe(200);
    expect(startSpan).toHaveBeenCalledTimes(1);
    expect(span.end).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('does not throw when OTel modules are unavailable', async () => {
    vi.stubEnv('OTEL_DISABLED', 'false');
    // With OTEL_DISABLED=false but no real OTel SDK available in test env,
    // bootstrapOtel should catch the import error and return null.
    const app = Fastify();
    await expect(attachRuntimeTelemetry(app, 'test-svc')).resolves.toBeUndefined();
    await app.close();
  });

  it('handles missing traceparent gracefully', async () => {
    vi.stubEnv('OTEL_DISABLED', 'true');
    const span = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
    };
    const startSpan = vi.fn(() => span);
    vi.spyOn(trace, 'getTracer').mockReturnValue({ startSpan } as never);
    vi.spyOn(propagation, 'extract').mockReturnValue(otelContext.active());

    const app = Fastify();
    await attachRuntimeTelemetry(app, 'gateway');
    app.get('/health', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(startSpan).toHaveBeenCalled();

    await app.close();
  });

  it('marks 5xx responses as errors', async () => {
    vi.stubEnv('OTEL_DISABLED', 'true');
    const span = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
    };
    const startSpan = vi.fn(() => span);
    vi.spyOn(trace, 'getTracer').mockReturnValue({ startSpan } as never);
    vi.spyOn(propagation, 'extract').mockReturnValue(otelContext.active());

    const app = Fastify();
    await attachRuntimeTelemetry(app, 'gateway');
    app.get('/fail', async () => {
      throw new Error('boom');
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/fail' });
    expect(response.statusCode).toBe(500);
    expect(span.setStatus).toHaveBeenCalledWith({ code: 2 }); // SpanStatusCode.ERROR
    expect(span.end).toHaveBeenCalled();

    await app.close();
  });
});
