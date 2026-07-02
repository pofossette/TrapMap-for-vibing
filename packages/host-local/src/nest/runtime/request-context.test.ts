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
      traceId: 'trace-456',
      traceHeaderName: 'traceparent',
      method: 'GET',
      route: '/v1/knowledge/test',
    };

    service.run(ctx, () => {
      const result = service.get();
      expect(result).toEqual(ctx);
      expect(service.getRequestId()).toBe('req-123');
      expect(service.getTraceId()).toBe('trace-456');
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
  });

  it('should use fallback existingId when header is missing', () => {
    const ctx = extractRequestContext({}, config, {
      method: 'GET',
      route: '/test',
      existingId: 'fastify-id',
    });
    expect(ctx.requestId).toBe('fastify-id');
  });

  it('should extract traceId from traceparent header', () => {
    const ctx = extractRequestContext({ traceparent: '00-trace-abc' }, config, {
      method: 'POST',
      route: '/test',
    });
    expect(ctx.traceId).toBe('00-trace-abc');
  });

  it('should set traceId to null when trace header is absent', () => {
    const ctx = extractRequestContext({}, config, { method: 'GET', route: '/test' });
    expect(ctx.traceId).toBeNull();
  });

  it('should use configured header names', () => {
    const customConfig = {
      requestIdHeader: 'x-custom-id',
      traceHeaderName: 'x-trace',
    };
    const ctx = extractRequestContext(
      { 'x-custom-id': 'custom-id', 'x-trace': 'custom-trace' },
      customConfig,
      { method: 'GET', route: '/test' },
    );
    expect(ctx.requestId).toBe('custom-id');
    expect(ctx.traceId).toBe('custom-trace');
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
        headers: { 'x-request-id': 'req-1', traceparent: 'trace-1' },
        method: 'GET',
        url: '/health',
        id: 'fastify-id',
        routeOptions: { url: '/health' },
      } as never,
      { header } as never,
      next,
    );

    expect(header).toHaveBeenNthCalledWith(1, 'x-request-id', 'req-1');
    expect(header).toHaveBeenNthCalledWith(2, 'traceparent', 'trace-1');
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
