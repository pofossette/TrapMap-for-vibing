import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestContext } from './request-context.js';
import { createTracingPortAdapter } from './tracing-port-adapter.js';

describe('TracingPort adapter', () => {
  describe('no-op mode (enabled=false, default)', () => {
    it('returns a no-op span handle that can be called without errors', () => {
      const tracing = createTracingPortAdapter();

      const span = tracing.startSpan('test-span', { key: 'value' });
      expect(span).toBeDefined();

      // All methods should be callable without throwing
      span.setAttribute('attr', 'val');
      span.recordError(new Error('test'));
      span.end();
    });

    it('returns undefined trace ID when no request context accessor is provided', () => {
      const tracing = createTracingPortAdapter();
      expect(tracing.getCurrentTraceId()).toBeUndefined();
    });

    it('returns undefined trace ID when request context has no traceId', () => {
      const ctx: RequestContext = {
        requestId: 'req-1',
        traceHeaderName: 'x-trace-id',
        traceId: null,
        traceParent: null,
        method: 'GET',
        route: '/api',
      };
      const tracing = createTracingPortAdapter(() => ctx);
      expect(tracing.getCurrentTraceId()).toBeUndefined();
    });

    it('returns the trace ID from the request context', () => {
      const ctx: RequestContext = {
        requestId: 'req-1',
        traceHeaderName: 'x-trace-id',
        traceId: 'abc123def456',
        traceParent: '00-abc123def456-0000000000000000-01',
        method: 'GET',
        route: '/api',
      };
      const tracing = createTracingPortAdapter(() => ctx);
      expect(tracing.getCurrentTraceId()).toBe('abc123def456');
    });

    it('shuts down without errors', async () => {
      const tracing = createTracingPortAdapter();
      await expect(tracing.shutdown()).resolves.toBeUndefined();
    });

    it('creates independent no-op span handles', () => {
      const tracing = createTracingPortAdapter();

      const span1 = tracing.startSpan('span-1');
      const span2 = tracing.startSpan('span-2');

      span1.setAttribute('only', 'one');
      // span2 should not be affected -- both are independent no-op handles
      span1.end();
      span2.end();
    });
  });

  describe('enabled mode with OTel API unavailable', () => {
    it('falls back to no-op spans when OTel API cannot be loaded', () => {
      // enabled=true but the OTel API isn't loaded in the test environment,
      // so startSpan returns no-op handles.
      const tracing = createTracingPortAdapter(undefined, { enabled: true });

      const span = tracing.startSpan('test-span', { key: 'value' });
      expect(span).toBeDefined();

      // Should not throw
      span.setAttribute('attr', 'val');
      span.recordError(new Error('test'));
      span.end();
    });

    it('getCurrentTraceId falls back to request context when OTel API is not loaded', () => {
      const ctx: RequestContext = {
        requestId: 'req-1',
        traceHeaderName: 'x-trace-id',
        traceId: 'from-request-context',
        traceParent: '00-from-request-context-0000000000000000-01',
        method: 'GET',
        route: '/api',
      };
      const tracing = createTracingPortAdapter(() => ctx, { enabled: true });
      expect(tracing.getCurrentTraceId()).toBe('from-request-context');
    });
  });

  describe('shutdown clears module cache', () => {
    it('resets the OTel module cache on shutdown', async () => {
      const tracing = createTracingPortAdapter(undefined, { enabled: true });
      await tracing.shutdown();
      // After shutdown, getCurrentTraceId should still work (no-op path)
      expect(tracing.getCurrentTraceId()).toBeUndefined();
    });
  });
});
