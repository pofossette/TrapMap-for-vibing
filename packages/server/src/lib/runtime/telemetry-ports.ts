/**
 * Server-local telemetry port interfaces.
 *
 * These mirror the host-agnostic contracts used by host assemblies without
 * making the server infrastructure layer depend on backend-core.
 */

export interface SpanHandle {
  end(): void;
  setAttribute(key: string, value: string): void;
  recordError(error: Error): void;
}

export interface MetricsPort {
  incrementCounter(name: string, labels?: Record<string, string>, value?: number): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void;
  renderMetrics(): Promise<string>;
}

export interface TracingPort {
  startSpan(name: string, attributes?: Record<string, string>): SpanHandle;
  getCurrentTraceId(): string | undefined;
  shutdown(): Promise<void>;
}

export interface LoggingPort {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): LoggingPort;
}
