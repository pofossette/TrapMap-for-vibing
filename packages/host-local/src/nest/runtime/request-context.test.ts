import { describe, expect, it, vi } from 'vitest';

import type { HostLocalConfig } from '../config/index.js';
import { RequestContextMiddleware } from './request-context.middleware.js';
import { extractRequestContext, RequestContextService } from './request-context.service.js';

describe('RequestContextService', () => {
  it('should return undefined outside a run scope', () => {
    const service = new RequestContextService();
    expect(service.get()).toBeUndefined();
  });

  it('should return context inside a run scope', () => {
    const service = new RequestContextService();
    const ctx = {
      requestId: 'req-123',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      traceHeaderName: 'traceparent',
      method: 'GET',
      route: '/v1/knowledge/test',
    };

    service.run(ctx, () => {
      const result = service.get();
      expect(result).toEqual(ctx);
      expect(service.getRequestId()).toBe('req-123');
      expect(service.getTraceId()).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    });
  });

  it('should return unknown requestId outside scope', () => {
    const service = new RequestContextService();
    expect(service.getRequestId()).toBe('unknown');
    expect(service.getTraceId()).toBeNull();
  });
});

describe('extractRequestContext', () => {
  const config = {
    requestIdHeader: 'x-request-id',
    traceHeaderName: 'traceparent',
  };

  it('should use existing request-id header', () => {
    const ctx = extractRequestContext({ 'x-request-id': 'incoming-id' }, config, {
      method: 'GET',
      route: '/test',
    });
    expect(ctx.requestId).toBe('incoming-id');
  });

  it('should generate requestId when header is missing', () => {
    const ctx = extractRequestContext({}, config, { method: 'GET', route: '/test' });
    expect(ctx.requestId).toBeDefined();
    expect(ctx.requestId.length).toBeGreaterThan(0);
    expect(ctx.operationId).toEqual(expect.any(String));
  });

  it('should use fallback existingId when header is missing', () => {
    const ctx = extractRequestContext({}, config, {
      method: 'GET',
      route: '/test',
      existingId: 'fastify-id',
    });
    expect(ctx.requestId).toBe('fastify-id');
  });

  it('should extract traceId from a valid traceparent header', () => {
    const ctx = extractRequestContext(
      { traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      config,
      {
      method: 'POST',
      route: '/test',
      },
    );
    expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(ctx.traceParent).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });

  it('treats an invalid traceparent as absent', () => {
    const ctx = extractRequestContext({ traceparent: 'trace-abc' }, config, {
      method: 'POST',
      route: '/test',
    });

    expect(ctx.traceId).toBeNull();
    expect(ctx.traceParent).toBeNull();
  });

  it('extracts internal operation and causation headers', () => {
    const ctx = extractRequestContext(
      {
        'x-trapmap-operation-id': 'operation_1',
        'x-trapmap-causation-id': 'event_1',
      },
      config,
      { method: 'POST', route: '/test' },
    );

    expect(ctx.operationId).toBe('operation_1');
    expect(ctx.causationId).toBe('event_1');
  });

  it('should set traceId to null when trace header is absent', () => {
    const ctx = extractRequestContext({}, config, { method: 'GET', route: '/test' });
    expect(ctx.traceId).toBeNull();
    expect(ctx.traceParent).toBeNull();
  });

  it('should use configured header names', () => {
    const customConfig = {
      requestIdHeader: 'x-custom-id',
      traceHeaderName: 'x-trace',
    };
    const ctx = extractRequestContext(
      { 'x-custom-id': 'custom-id', 'x-trace': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' },
      customConfig,
      { method: 'GET', route: '/test' },
    );
    expect(ctx.requestId).toBe('custom-id');
    expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });
});

describe('RequestContextMiddleware', () => {
  const config = {
    runtime: {
      requestIdHeader: 'x-request-id',
      traceHeaderName: 'traceparent',
    },
  } as HostLocalConfig;

  it('sets request and trace headers through Fastify reply.header', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service, config);
    const header = vi.fn();
    const next = vi.fn();

    middleware.use(
      {
        headers: {
          'x-request-id': 'req-1',
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        },
        method: 'GET',
        url: '/health',
        id: 'fastify-id',
        routeOptions: { url: '/health' },
      } as never,
      { header } as never,
      next,
    );

    expect(header).toHaveBeenNthCalledWith(1, 'x-request-id', 'req-1');
    expect(header).toHaveBeenNthCalledWith(
      2,
      'traceparent',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to raw.setHeader when reply.header is unavailable', () => {
    const service = new RequestContextService();
    const middleware = new RequestContextMiddleware(service, config);
    const setHeader = vi.fn();
    const next = vi.fn();

    middleware.use(
      {
        headers: {},
        method: 'GET',
        url: '/health',
        id: 'fastify-id',
        routeOptions: { url: '/health' },
      } as never,
      { raw: { setHeader } } as never,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'fastify-id');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
