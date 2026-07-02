/**
 * TracingPort adapter -- Phase 1A stub implementation.
 *
 * The server currently has no distributed tracing infrastructure; trace IDs
 * are propagated via request headers and stored in the request context.
 * This adapter provides a lightweight no-op implementation that satisfies
 * the TracingPort interface.  Phase 2B will replace it with a real
 * OpenTelemetry-backed implementation that produces and exports spans.
 */

import type { SpanHandle, TracingPort } from '@trapmap/backend-core';

import type { RequestContext } from './request-context.js';

function createNoOpSpanHandle(): SpanHandle {
  return {
    end(): void {
      /* no-op -- real spans will be produced in Phase 2B */
    },
    setAttribute(_key: string, _value: string): void {
      /* no-op */
    },
    recordError(_error: Error): void {
      /* no-op */
    },
  };
}

/**
 * Factory for the Phase 1A tracing stub.
 *
 * @param requestContextAccessor - Optional callback that returns the current
 *   request context, used to extract the trace ID from incoming headers.
 */
export function createTracingPortAdapter(
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
