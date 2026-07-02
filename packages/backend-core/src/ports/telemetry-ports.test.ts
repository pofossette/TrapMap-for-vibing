import { describe, expect, it } from 'vitest';

import type { LoggingPort, MetricsPort, SpanHandle, TracingPort } from './telemetry-ports.js';

// ---------------------------------------------------------------------------
// In-memory stub implementations that satisfy the port interfaces
// ---------------------------------------------------------------------------

interface MetricEntry {
  value: number;
  labels: Record<string, string>;
}

class StubMetrics implements MetricsPort {
  readonly counters = new Map<string, MetricEntry[]>();
  readonly gauges = new Map<string, MetricEntry[]>();
  readonly histograms = new Map<string, MetricEntry[]>();

  incrementCounter(name: string, labels?: Record<string, string>, value?: number): void {
    const entries = this.counters.get(name) ?? [];
    entries.push({ value: value ?? 1, labels: labels ?? {} });
    this.counters.set(name, entries);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const entries = this.gauges.get(name) ?? [];
    entries.push({ value, labels: labels ?? {} });
    this.gauges.set(name, entries);
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const entries = this.histograms.get(name) ?? [];
    entries.push({ value, labels: labels ?? {} });
    this.histograms.set(name, entries);
  }

  async renderMetrics(): Promise<string> {
    const lines: string[] = [];
    for (const [name, entries] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const e of entries) {
        lines.push(`${name} ${e.value}`);
      }
    }
    return lines.join('\n');
  }
}

class StubSpanHandle implements SpanHandle {
  ended = false;
  readonly attributes: Record<string, string> = {};
  readonly errors: Error[] = [];

  end(): void {
    this.ended = true;
  }

  setAttribute(key: string, value: string): void {
    this.attributes[key] = value;
  }

  recordError(error: Error): void {
    this.errors.push(error);
  }
}

class StubTracing implements TracingPort {
  readonly spans: StubSpanHandle[] = [];
  private traceId: string | undefined;
  shutdownCalled = false;

  startSpan(_name: string, attributes?: Record<string, string>): SpanHandle {
    const span = new StubSpanHandle();
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v);
      }
    }
    this.spans.push(span);
    this.traceId = `trace-${this.spans.length}`;
    return span;
  }

  getCurrentTraceId(): string | undefined {
    return this.traceId;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
  }
}

interface LogEntry {
  level: string;
  message: string;
  context?: Record<string, unknown>;
}

class StubLogging implements LoggingPort {
  readonly entries: LogEntry[] = [];
  readonly parentContext: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.parentContext = context;
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: 'warn', message, context });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: 'error', message, context });
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: 'debug', message, context });
  }

  child(context: Record<string, unknown>): LoggingPort {
    return new StubLogging({ ...this.parentContext, ...context });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MetricsPort', () => {
  it('tracks counter increments', () => {
    const metrics: MetricsPort = new StubMetrics();
    metrics.incrementCounter('requests', { method: 'GET' });
    metrics.incrementCounter('requests', { method: 'GET' }, 5);

    const stub = metrics as unknown as StubMetrics;
    expect(stub.counters.get('requests')).toHaveLength(2);
    expect(stub.counters.get('requests')![0].value).toBe(1);
    expect(stub.counters.get('requests')![1].value).toBe(5);
  });

  it('tracks gauge values', () => {
    const metrics: MetricsPort = new StubMetrics();
    metrics.setGauge('connections', 42, { pool: 'primary' });

    const stub = metrics as unknown as StubMetrics;
    expect(stub.gauges.get('connections')).toHaveLength(1);
    expect(stub.gauges.get('connections')![0].value).toBe(42);
  });

  it('tracks histogram observations', () => {
    const metrics: MetricsPort = new StubMetrics();
    metrics.observeHistogram('latency_ms', 120);
    metrics.observeHistogram('latency_ms', 250);

    const stub = metrics as unknown as StubMetrics;
    expect(stub.histograms.get('latency_ms')).toHaveLength(2);
  });

  it('renders metrics as Prometheus text', async () => {
    const metrics: MetricsPort = new StubMetrics();
    metrics.incrementCounter('http_requests_total', { path: '/' });
    const output = await metrics.renderMetrics();

    expect(output).toContain('# TYPE http_requests_total counter');
    expect(output).toContain('http_requests_total 1');
  });
});

describe('TracingPort', () => {
  it('creates spans that can set attributes and record errors', () => {
    const tracing: TracingPort = new StubTracing();
    const span = tracing.startSpan('db.query', { table: 'entries' });

    span.setAttribute('db.statement', 'SELECT 1');
    span.recordError(new Error('connection lost'));
    span.end();

    const stub = tracing as unknown as StubTracing;
    const handle = stub.spans[0];
    expect(handle.ended).toBe(true);
    expect(handle.attributes['db.statement']).toBe('SELECT 1');
    expect(handle.errors).toHaveLength(1);
    expect(handle.errors[0].message).toBe('connection lost');
  });

  it('returns trace ID after starting a span', () => {
    const tracing: TracingPort = new StubTracing();
    expect(tracing.getCurrentTraceId()).toBeUndefined();

    tracing.startSpan('root');
    expect(tracing.getCurrentTraceId()).toBe('trace-1');
  });

  it('shuts down cleanly', async () => {
    const tracing: TracingPort = new StubTracing();
    await tracing.shutdown();

    const stub = tracing as unknown as StubTracing;
    expect(stub.shutdownCalled).toBe(true);
  });
});

describe('LoggingPort', () => {
  it('logs at each level', () => {
    const logger: LoggingPort = new StubLogging();
    logger.info('started');
    logger.warn('slow');
    logger.error('failed', { code: 500 });
    logger.debug('detail');

    const stub = logger as unknown as StubLogging;
    expect(stub.entries).toHaveLength(4);
    expect(stub.entries.map((e) => e.level)).toEqual(['info', 'warn', 'error', 'debug']);
  });

  it('creates a child logger with merged context', () => {
    const parent: LoggingPort = new StubLogging({ service: 'gateway' });
    const child = parent.child({ requestId: 'abc-123' });

    const childStub = child as unknown as StubLogging;
    expect(childStub.parentContext).toEqual({ service: 'gateway', requestId: 'abc-123' });
  });
});
