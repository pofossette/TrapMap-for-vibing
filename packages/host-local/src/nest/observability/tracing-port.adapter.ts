import { Injectable, Logger } from '@nestjs/common';
import type { TracingPort, SpanHandle } from '@trapmap/backend-core';
import { OtelService } from './otel.service.js';

/**
 * No-op {@link SpanHandle} returned when OTel is not initialized.
 */
class NoOpSpanHandle implements SpanHandle {
  end(): void {
    // no-op
  }
  setAttribute(_key: string, _value: string): void {
    // no-op
  }
  recordError(_error: Error): void {
    // no-op
  }
}

/**
 * NestJS adapter that implements the shared {@link TracingPort}
 * by bridging to the OpenTelemetry SDK managed by {@link OtelService}.
 *
 * When OTel is disabled or failed to initialize, all operations
 * degrade to no-ops gracefully.
 */
@Injectable()
export class TracingPortAdapter implements TracingPort {
  private readonly logger = new Logger(TracingPortAdapter.name);
  private otelApi: typeof import('@opentelemetry/api') | null = null;
  private loadAttempted = false;

  constructor(private readonly otelService: OtelService) {}

  startSpan(name: string, attributes?: Record<string, string>): SpanHandle {
    const api = this.getOtelApi();
    if (!api) {
      return new NoOpSpanHandle();
    }

    try {
      const tracer = api.trace.getTracer('trapmap-host-local');
      const span = tracer.startSpan(name, {
        attributes: attributes as Record<string, api.AttributeValue> | undefined,
      });

      return {
        end() {
          span.end();
        },
        setAttribute(key: string, value: string) {
          span.setAttribute(key, value);
        },
        recordError(error: Error) {
          span.recordException(error);
          span.setStatus({ code: 2 }); // SpanStatusCode.ERROR
        },
      };
    } catch (err) {
      this.logger.warn(`Failed to start span "${name}": ${err}`);
      return new NoOpSpanHandle();
    }
  }

  getCurrentTraceId(): string | undefined {
    const api = this.getOtelApi();
    if (!api) {
      return undefined;
    }

    try {
      const span = api.trace.getActiveSpan();
      if (!span) {
        return undefined;
      }
      const spanContext = span.spanContext();
      return spanContext.traceId || undefined;
    } catch {
      return undefined;
    }
  }

  async shutdown(): Promise<void> {
    // Delegates to OtelService's own shutdown logic
    // (it implements OnApplicationShutdown so it will also run on app close)
    // This method is for explicit programmatic shutdown if needed.
    this.logger.log('TracingPortAdapter shutdown requested');
  }

  /**
   * Lazy-load the OTel API module. Returns null if not available
   * (e.g. OTel is disabled or the import fails).
   */
  private getOtelApi(): typeof import('@opentelemetry/api') | null {
    if (this.loadAttempted) {
      return this.otelApi;
    }
    this.loadAttempted = true;

    try {
      // require is safe here: @opentelemetry/api is a dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.otelApi = require('@opentelemetry/api');
      return this.otelApi;
    } catch {
      this.logger.debug(
        'OpenTelemetry API not available; tracing operations will be no-ops',
      );
      return null;
    }
  }
}
