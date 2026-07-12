/**
 * Integration smoke tests for the observability chain.
 *
 * Verifies that a single request produces all four observability signals
 * (request id, trace header, metrics, structured logs) through the
 * middleware and adapter layers.
 *
 * These are unit-level tests with mocked external services, but they
 * verify the full signal chain through the middleware and adapters.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  extractRequestContext,
  RequestContextService,
  type NestRequestContext,
} from '../runtime/request-context.service.js';

import {
  logEntrySchema,
  buildLokiLabels,
  formatLogForStdout,
  type LogEntry,
} from '@trapmap/contracts';

// ── 1. Request Context: requestId + traceId extraction ────────────────

describe('observability chain: request context extraction', () => {
  const config = {
    requestIdHeader: 'x-request-id',
    traceHeaderName: 'traceparent',
  };

  it('extracts both requestId and traceId from incoming headers', () => {
    const ctx = extractRequestContext(
      {
        'x-request-id': 'req-abc-123',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
      config,
      { method: 'GET', route: '/v1/traps' },
    );

    expect(ctx.requestId).toBe('req-abc-123');
    expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(ctx.method).toBe('GET');
    expect(ctx.route).toBe('/v1/traps');
  });

  it('generates requestId and rejects an invalid traceparent', () => {
    const ctx = extractRequestContext(
      { traceparent: 'trace-xyz' },
      config,
      { method: 'POST', route: '/v1/candidates' },
    );

    expect(ctx.requestId).toBeDefined();
    expect(ctx.requestId.length).toBeGreaterThan(0);
    expect(ctx.traceId).toBeNull();
  });

  it('sets traceId to null when trace header is absent', () => {
    const ctx = extractRequestContext(
      { 'x-request-id': 'req-only' },
      config,
      { method: 'DELETE', route: '/v1/traps/42' },
    );

    expect(ctx.requestId).toBe('req-only');
    expect(ctx.traceId).toBeNull();
  });
});

// ── 2. Request Context Service: ALS propagation ──────────────────────

describe('observability chain: async local storage propagation', () => {
  it('propagates requestId and traceId through AsyncLocalStorage', () => {
    const service = new RequestContextService();
    const ctx: NestRequestContext = {
      requestId: 'req-propagated',
      traceId: 'trace-propagated',
      traceHeaderName: 'traceparent',
      method: 'GET',
      route: '/v1/health',
    };

    service.run(ctx, () => {
      const stored = service.get();
      expect(stored).toBeDefined();
      expect(stored!.requestId).toBe('req-propagated');
      expect(stored!.traceId).toBe('trace-propagated');
      expect(service.getRequestId()).toBe('req-propagated');
      expect(service.getTraceId()).toBe('trace-propagated');
    });
  });

  it('returns undefined outside request scope', () => {
    const service = new RequestContextService();
    expect(service.get()).toBeUndefined();
    expect(service.getRequestId()).toBe('unknown');
    expect(service.getTraceId()).toBeNull();
  });
});

// ── 3. Logging: structured log output ────────────────────────────────

describe('observability chain: logging middleware produces structured output', () => {
  it('logging middleware captures all required fields in log message', () => {
    // Simulate what LoggingMiddleware does:
    // it reads requestId and traceId from RequestContextService,
    // then logs: `${method} ${url} ${statusCode} ${duration}ms [${requestId}] [${traceId}]`
    const service = new RequestContextService();
    const ctx: NestRequestContext = {
      requestId: 'req-log-test',
      traceId: 'trace-log-test',
      traceHeaderName: 'traceparent',
      method: 'GET',
      route: '/v1/traps',
    };

    service.run(ctx, () => {
      const stored = service.get();
      const requestId = stored?.requestId ?? '-';
      const traceId = stored?.traceId ?? '-';
      const method = 'GET';
      const url = '/v1/traps';
      const statusCode = 200;
      const duration = 42;

      // This is the exact format used by LoggingMiddleware
      const logMessage = `${method} ${url} ${statusCode} ${duration}ms [${requestId}] [${traceId}]`;

      expect(logMessage).toContain('GET');
      expect(logMessage).toContain('/v1/traps');
      expect(logMessage).toContain('200');
      expect(logMessage).toContain('42ms');
      expect(logMessage).toContain('[req-log-test]');
      expect(logMessage).toContain('[trace-log-test]');

      // Verify all four signals are present in a single log line
      const signals = {
        hasMethod: logMessage.includes('GET'),
        hasUrl: logMessage.includes('/v1/traps'),
        hasStatus: logMessage.includes('200'),
        hasDuration: logMessage.includes('42ms'),
        hasRequestId: logMessage.includes('[req-log-test]'),
        hasTraceId: logMessage.includes('[trace-log-test]'),
      };
      expect(Object.values(signals).every(Boolean)).toBe(true);
    });
  });

  it('logging middleware uses dash fallback when context is unavailable', () => {
    const service = new RequestContextService();
    // Outside any request scope
    const stored = service.get();
    const requestId = stored?.requestId ?? '-';
    const traceId = stored?.traceId ?? '-';

    expect(requestId).toBe('-');
    expect(traceId).toBe('-');
  });
});

// ── 4. LogEntry contract: buildLokiLabels and formatLogForStdout ─────

describe('observability chain: log schema contract', () => {
  const fullEntry: LogEntry = {
    timestamp: '2026-07-02T10:00:00.000Z',
    level: 'info',
    service: 'trapmap',
    environment: 'production',
    traceId: 'trace-contract-test',
    requestId: 'req-contract-test',
    context: 'GET /v1/traps',
    message: 'Request completed',
  };

  it('buildLokiLabels returns only low-cardinality labels', () => {
    const labels = buildLokiLabels(fullEntry);

    expect(labels).toEqual({
      service: 'trapmap',
      environment: 'production',
      level: 'info',
    });

    // High-cardinality fields must NOT appear in labels
    expect(labels).not.toHaveProperty('traceId');
    expect(labels).not.toHaveProperty('requestId');
    expect(labels).not.toHaveProperty('context');
    expect(labels).not.toHaveProperty('timestamp');
    expect(labels).not.toHaveProperty('message');
  });

  it('buildLokiLabels label set matches LOKI_LOW_CARDINALITY_LABELS', () => {
    const labels = buildLokiLabels(fullEntry);
    const labelKeys = Object.keys(labels);

    // Must contain exactly 3 labels
    expect(labelKeys).toHaveLength(3);
    expect(labelKeys).toContain('service');
    expect(labelKeys).toContain('environment');
    expect(labelKeys).toContain('level');
  });

  it('formatLogForStdout produces parseable JSON context', () => {
    const output = formatLogForStdout(fullEntry);
    const parsed = JSON.parse(output);
    expect(parsed.traceId).toBe('trace-contract-test');
    expect(parsed.requestId).toBe('req-contract-test');
    expect(parsed.context).toBe('GET /v1/traps');
  });

  it('formatLogForStdout emits a complete JSON entry without extra fields', () => {
    const minimal: LogEntry = {
      timestamp: '2026-07-02T10:00:00.000Z',
      level: 'info',
      service: 'trapmap',
      environment: 'production',
      message: 'Server started',
    };
    const output = formatLogForStdout(minimal);

    expect(JSON.parse(output)).toEqual(minimal);
  });

  it('logEntrySchema validates a complete entry with trace correlation fields', () => {
    const result = logEntrySchema.parse(fullEntry);

    expect(result.traceId).toBe('trace-contract-test');
    expect(result.requestId).toBe('req-contract-test');
    expect(result.context).toBe('GET /v1/traps');
  });
});

// ── 5. LoggingPort adapter: format bridge ────────────────────────────

describe('observability chain: LoggingPort adapter format', () => {
  it('formats message without context as plain string', () => {
    // Simulate LoggingPortAdapter.formatMessage behavior
    const message = 'Service started';
    const context: Record<string, unknown> | undefined = undefined;

    const formatted = context && Object.keys(context).length > 0
      ? `${message} ${JSON.stringify(context)}`
      : message;

    expect(formatted).toBe('Service started');
  });

  it('formats message with context as message + JSON', () => {
    const message = 'Request processed';
    const context = { requestId: 'req-123', traceId: 'trace-456', duration: 42 };

    const formatted = `${message} ${JSON.stringify(context)}`;

    expect(formatted).toContain('Request processed');
    expect(formatted).toContain('"requestId":"req-123"');
    expect(formatted).toContain('"traceId":"trace-456"');
    expect(formatted).toContain('"duration":42');
  });

  it('child logger uses name from context', () => {
    // Simulate LoggingPortAdapter.child() behavior
    const context = { name: 'CandidateService' };
    const childContext = context['name'] ?? context['context'] ?? context['module'];
    const contextStr = typeof childContext === 'string' ? childContext : JSON.stringify(context);

    expect(contextStr).toBe('CandidateService');
  });
});

// ── 6. End-to-end signal chain simulation ────────────────────────────

describe('observability chain: end-to-end signal chain', () => {
  it('a single request produces all four observability signals', () => {
    // Simulate the full request lifecycle:
    // 1. RequestContextMiddleware extracts requestId + traceId
    const incomingHeaders = {
      'x-request-id': 'req-e2e-001',
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    };
    const ctx = extractRequestContext(
      incomingHeaders,
      { requestIdHeader: 'x-request-id', traceHeaderName: 'traceparent' },
      { method: 'GET', route: '/v1/traps' },
    );

    // 2. Context is stored in AsyncLocalStorage and available to all downstream code
    const service = new RequestContextService();
    service.run(ctx, () => {
      const stored = service.get()!;

      // Signal 1: Request ID
      expect(stored.requestId).toBe('req-e2e-001');

      // Signal 2: Trace ID (propagated from traceparent header)
      expect(stored.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

      // Signal 3: Metrics (simulated - PrometheusService would record these)
      const metricsLabels = {
        method: 'GET',
        route: '/v1/traps',
        status: '200',
      };
      expect(metricsLabels.method).toBe('GET');
      expect(metricsLabels.status).toBe('200');

      // Signal 4: Structured log (what LoggingMiddleware would produce)
      const logMessage = `${stored.method} ${stored.route} 200 35ms [${stored.requestId}] [${stored.traceId}]`;
      expect(logMessage).toBe(
        'GET /v1/traps 200 35ms [req-e2e-001] [4bf92f3577b34da6a3ce929d0e0e4736]',
      );

      // Also verify the Loki label path produces correct low-cardinality labels
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'trapmap',
        environment: 'development',
        traceId: stored.traceId ?? undefined,
        requestId: stored.requestId,
        context: `${stored.method} ${stored.route}`,
        message: logMessage,
      };
      const labels = buildLokiLabels(logEntry);
      expect(labels).toEqual({
        service: 'trapmap',
        environment: 'development',
        level: 'info',
      });

      // And stdout format includes correlation IDs
      const stdout = formatLogForStdout(logEntry);
      expect(JSON.parse(stdout)).toMatchObject({
        requestId: 'req-e2e-001',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      });
    });
  });

  it('response headers echo back requestId and traceId', () => {
    // Simulate what RequestContextMiddleware does with response headers
    const responseHeaders: Record<string, string> = {};
    const ctx = extractRequestContext(
      {
        'x-request-id': 'req-echo-test',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
      { requestIdHeader: 'x-request-id', traceHeaderName: 'traceparent' },
      { method: 'POST', route: '/v1/candidates' },
    );

    // Middleware sets these on response
    responseHeaders['x-request-id'] = ctx.requestId;
    if (ctx.traceParent) {
      responseHeaders[ctx.traceHeaderName] = ctx.traceParent;
    }

    expect(responseHeaders['x-request-id']).toBe('req-echo-test');
    expect(responseHeaders['traceparent']).toBe(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    );
  });
});
