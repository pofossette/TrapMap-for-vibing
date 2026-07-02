/**
 * TracingPort adapter -- Phase 2B real OTel integration.
 *
 * Replaces the Phase 1A no-op stub with a real OpenTelemetry-backed
 * implementation.  OTel packages are loaded via dynamic import so that
 * environments with tracing disabled never pay the import cost.
 *
 * The adapter assumes the OTel SDK has already been bootstrapped by
 * `bootstrap-otel.ts` in the startup sequence.  It reads the active
 * tracer from the global OTel API, which the SDK sets up.
 *
 * Design constraints (from the tracing plan):
 * - Exporter failures MUST NOT block the main request path (fail-open).
 * - Sampling strategy MUST be explicit; no unlimited collection by default.
 */

import type { RequestContext } from './request-context.js';
import type { SpanHandle, TracingPort } from './telemetry-ports.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TracingPortAdapterOptions {
  /** Enable real OTel tracing.  Default: false (no-op mode). */
  enabled?: boolean;
  /** Deployment profile -- determines exporter type.  Default: 'local-agent'. */
  profile?: string;
  /** Service name for the tracer.  Default: 'trapmap'. */
  serviceName?: string;
}

// ---------------------------------------------------------------------------
// No-op span handle -- used as fallback when OTel is unavailable or fails.
// ---------------------------------------------------------------------------

function createNoOpSpanHandle(): SpanHandle {
  return {
    end(): void {
      /* no-op -- OTel unavailable or tracing disabled */
    },
    setAttribute(_key: string, _value: string): void {
      /* no-op */
    },
    recordError(_error: Error): void {
      /* no-op */
    },
  };
}

// ---------------------------------------------------------------------------
// Lazy OTel module cache -- populated on first use, null if unavailable.
// ---------------------------------------------------------------------------

interface OtelModule {
  trace: typeof import('@opentelemetry/api').trace;
  SpanStatusCode: typeof import('@opentelemetry/api').SpanStatusCode;
}

let otelModule: OtelModule | null | undefined; // undefined = not yet loaded

async function loadOtelApi(): Promise<OtelModule | null> {
  if (otelModule !== undefined) {
    return otelModule;
  }
  try {
    const api = await import('@opentelemetry/api');
    otelModule = {
      trace: api.trace,
      SpanStatusCode: api.SpanStatusCode,
    };
    return otelModule;
  } catch {
    otelModule = null;
    return null;
  }
}

/**
 * Synchronously try to get the already-loaded OTel API.
 * Returns null if not yet loaded -- callers should fall back gracefully.
 */
function getOtelApiSync(): OtelModule | null {
  return otelModule === undefined ? null : otelModule;
}

// ---------------------------------------------------------------------------
// Real span handle wrapper
// ---------------------------------------------------------------------------

function createRealSpanHandle(
  span: import('@opentelemetry/api').Span,
  otel: OtelModule,
): SpanHandle {
  return {
    end(): void {
      try {
        span.end();
      } catch {
        /* fail-open: exporter error must not propagate */
      }
    },
    setAttribute(key: string, value: string): void {
      try {
        span.setAttribute(key, value);
      } catch {
        /* fail-open */
      }
    },
    recordError(error: Error): void {
      try {
        span.recordException(error);
        span.setStatus({
          code: otel.SpanStatusCode.ERROR,
          message: error.message,
        });
      } catch {
        /* fail-open */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a TracingPort backed by OpenTelemetry.
 *
 * When `options.enabled` is false (the default), this returns the same
 * no-op adapter that Phase 1A provided.  When enabled, it loads the
 * OTel API on first use and creates real spans from the global tracer.
 *
 * The SDK must have been started before spans are created (typically
 * via `bootstrap-otel.ts` in the startup sequence).
 *
 * @param requestContextAccessor - Optional callback that returns the current
 *   request context, used to extract the trace ID from incoming headers.
 */
export function createTracingPortAdapter(
  requestContextAccessor?: () => RequestContext | undefined,
  options: TracingPortAdapterOptions = {},
): TracingPort {
  const { enabled = false, serviceName = 'trapmap' } = options;

  // If not enabled, return the no-op adapter immediately (no OTel imports).
  if (!enabled) {
    return createNoOpTracingPort(requestContextAccessor);
  }

  // Kick off OTel API loading in the background so it's ready when
  // startSpan is first called.  This is fire-and-forget; if it fails,
  // startSpan will degrade to no-op.
  void loadOtelApi();

  return {
    startSpan(name: string, attributes?: Record<string, string>): SpanHandle {
      // Try to get the OTel API synchronously (already loaded).
      const otel = getOtelApiSync();
      if (!otel) {
        // API not loaded yet -- return a no-op handle.
        // The span is effectively dropped; this is acceptable for the
        // initial requests while the SDK is bootstrapping.
        return createNoOpSpanHandle();
      }

      try {
        const tracer = otel.trace.getTracer(serviceName);
        const span = tracer.startSpan(name, {
          ...(attributes ? { attributes: { ...attributes } } : {}),
        });
        return createRealSpanHandle(span, otel);
      } catch {
        // fail-open: any OTel error degrades to no-op
        return createNoOpSpanHandle();
      }
    },

    getCurrentTraceId(): string | undefined {
      // Try OTel active span context first.
      const otel = getOtelApiSync();
      if (otel) {
        try {
          const spanContext = otel.trace.getActiveSpan()?.spanContext();
          if (spanContext?.traceId && spanContext.traceId !== '00000000000000000000000000000000') {
            return spanContext.traceId;
          }
        } catch {
          // fail-open: fall through to request context
        }
      }

      // Fallback to request context trace ID.
      const ctx = requestContextAccessor?.();
      return ctx?.traceId ?? undefined;
    },

    async shutdown(): Promise<void> {
      // The adapter does not own the SDK lifecycle; that's handled by
      // the bootstrap module.  But we clear the module cache so a
      // subsequent restart would re-initialise cleanly.
      otelModule = undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// No-op adapter (tracing disabled)
// ---------------------------------------------------------------------------

function createNoOpTracingPort(
  requestContextAccessor?: () => RequestContext | undefined,
): TracingPort {
  return {
    startSpan(_name: string, _attributes?: Record<string, string>): SpanHandle {
      return createNoOpSpanHandle();
    },

    getCurrentTraceId(): string | undefined {
      const ctx = requestContextAccessor?.();
      return ctx?.traceId ?? undefined;
    },

    async shutdown(): Promise<void> {
      /* no-op -- no resources to release */
    },
  };
}
