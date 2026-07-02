/**
 * Telemetry port interfaces.
 *
 * These are host-agnostic abstractions for metrics, distributed tracing,
 * and structured logging. Concrete implementations (Prometheus/OTel,
 * Fastify logger, winston, etc.) are provided by host assemblies.
 */

/**
 * Handle to an in-flight distributed trace span.
 */
export interface SpanHandle {
  /** Mark the span as finished. */
  end(): void;

  /** Attach a key-value attribute to the span. */
  setAttribute(key: string, value: string): void;

  /** Record an error event on the span and mark it as errored. */
  recordError(error: Error): void;
}

/**
 * Port interface for recording metrics (counters, gauges, histograms).
 *
 * Implementations may bridge to Prometheus client, OpenTelemetry SDK,
 * or an in-memory store for testing.
 */
export interface MetricsPort {
  /** Increment a named counter by the given value (default 1). */
  incrementCounter(name: string, labels?: Record<string, string>, value?: number): void;

  /** Set a named gauge to an absolute value. */
  setGauge(name: string, value: number, labels?: Record<string, string>): void;

  /** Record an observation in a named histogram. */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void;

  /** Render all registered metrics in Prometheus text exposition format. */
  renderMetrics(): Promise<string>;
}

/**
 * Port interface for distributed tracing.
 *
 * Implementations may bridge to OpenTelemetry, Jaeger, or a no-op stub.
 */
export interface TracingPort {
  /** Start a new span and return a handle to control its lifecycle. */
  startSpan(name: string, attributes?: Record<string, string>): SpanHandle;

  /** Return the trace ID of the currently active span, if any. */
  getCurrentTraceId(): string | undefined;

  /** Flush pending spans and release tracing resources. */
  shutdown(): Promise<void>;
}

/**
 * Port interface for structured logging.
 *
 * Implementations may bridge to pino, winston, console, or a test spy.
 */
export interface LoggingPort {
  /** Log at info level. */
  info(message: string, context?: Record<string, unknown>): void;

  /** Log at warn level. */
  warn(message: string, context?: Record<string, unknown>): void;

  /** Log at error level. */
  error(message: string, context?: Record<string, unknown>): void;

  /** Log at debug level. */
  debug(message: string, context?: Record<string, unknown>): void;

  /** Create a child logger that inherits the parent context. */
  child(context: Record<string, unknown>): LoggingPort;
}
