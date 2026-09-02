import { randomBytes, randomUUID } from 'node:crypto';
import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api';

import { recordDistributedInternalHopMetric } from '../internal-observability.js';
import {
  CircuitBreaker,
  resolveBreakerCooldownMs,
  resolveBreakerThreshold,
} from '../resilience.js';

export interface ServiceResponse {
  status: number;
  body: unknown;
}

export interface InternalRpcEnvelope {
  method: string;
  input: unknown;
}

export interface InternalRequestOptions {
  headers?: Record<string, string> | undefined;
  timeoutMs?: number | undefined;
}

const DEFAULT_INTERNAL_TIMEOUT_MS = 10_000;

export function classifyInternalServiceKind(status: number): string {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 504) return 'timeout';
  if (status === 503) return 'unavailable';
  return 'internal';
}

export function normalizeCanonicalErrorBody(status: number, body: unknown): unknown {
  if (body && typeof body === 'object') {
    const payload = body as Record<string, unknown>;
    if (typeof payload.kind === 'string' && typeof payload.error === 'string') {
      return body;
    }
  }

  const kind = classifyInternalServiceKind(status);
  return {
    error: `Internal service ${kind.replace(/-/g, ' ')}`,
    kind,
  };
}

// fallow-ignore-next-line complexity -- Task C2 仅重命名既有实现体（原 callInternalService），行为不变硬约束下不重构函数体
export async function callInternalServiceOnce(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  query?: Record<string, string>,
  options?: InternalRequestOptions,
): Promise<ServiceResponse> {
  const startedAt = Date.now();
  const urlObj = new URL(url);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      urlObj.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_INTERNAL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers ?? {}),
  };
  // Task C3: every internal hop carries a correlation id — forward the
  // caller's x-request-id when present, otherwise generate one.
  if (!headers['x-request-id']) {
    headers['x-request-id'] = randomUUID();
  }
  // W3C traceparent fallback: without a registered OTel SDK the injector
  // emits nothing (invalid span context), so synthesize a valid header to
  // keep trace context unbroken across internal hops.
  if (!headers.traceparent) {
    headers.traceparent = `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
  }
  const serviceName = 'gateway';
  const targetService = urlObj.hostname;
  const parentContext = propagation.extract(otelContext.active(), headers);
  const span = trace.getTracer('trapmap-distributed-http').startSpan(
    `${method} ${urlObj.pathname}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.request.method': method,
        'url.path': urlObj.pathname,
        'trapmap.service_name': serviceName,
        'trapmap.target_service': targetService,
      },
    },
    parentContext,
  );
  const spanContext = trace.setSpan(parentContext, span);
  propagation.inject(spanContext, headers);

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(urlObj.toString(), init);
    const responseBody = await response.json().catch(() => null);
    recordDistributedInternalHopMetric({
      serviceName,
      targetService,
      transport: urlObj.pathname.includes('/rpc/') ? 'rpc' : 'http',
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
    });
    span.setAttribute('http.response.status_code', response.status);
    if (response.status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();

    return {
      status: response.status,
      body:
        response.status >= 200 && response.status < 300
          ? responseBody
          : normalizeCanonicalErrorBody(response.status, responseBody),
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      recordDistributedInternalHopMetric({
        serviceName,
        targetService,
        transport: urlObj.pathname.includes('/rpc/') ? 'rpc' : 'http',
        latencyMs: Date.now() - startedAt,
        statusCode: 504,
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Internal service timeout' });
      span.end();
      return { status: 504, body: { error: 'Internal service timeout', kind: 'timeout' } };
    }
    recordDistributedInternalHopMetric({
      serviceName,
      targetService,
      transport: urlObj.pathname.includes('/rpc/') ? 'rpc' : 'http',
      latencyMs: Date.now() - startedAt,
      statusCode: 503,
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Internal service unavailable' });
    span.end();
    return {
      status: 503,
      body: { error: 'Internal service unavailable', kind: 'unavailable' },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Resilient wrapper (Task C2): breaker + idempotent retry + timeout budgets.
// Default env → maxAttempts=1 and breakers closed ⇒ behavior identical to the
// single-attempt client above.
// ---------------------------------------------------------------------------

// Per-origin breakers are created lazily so env overrides
// (TRAPMAP_INTERNAL_BREAKER_THRESHOLD / _COOLDOWN_MS) apply whenever the first
// request to that origin happens, not at module-load time.
const internalBreakersByOrigin = new Map<string, CircuitBreaker>();

export function breakerForOrigin(origin: string): CircuitBreaker {
  const existing = internalBreakersByOrigin.get(origin);
  if (existing) return existing;
  const breaker = new CircuitBreaker({
    threshold: resolveBreakerThreshold(process.env),
    cooldownMs: resolveBreakerCooldownMs(process.env),
  });
  internalBreakersByOrigin.set(origin, breaker);
  return breaker;
}

/** Task C5: snapshot of per-origin circuit breaker states for readiness reporting. */
export function breakerStatesSnapshot(): Record<string, 'closed' | 'open' | 'half-open'> {
  const states: Record<string, 'closed' | 'open' | 'half-open'> = {};
  for (const [origin, breaker] of internalBreakersByOrigin) {
    states[origin] = breaker.state;
  }
  return states;
}

export class TransientInternalResponseError extends Error {
  constructor(public readonly response: ServiceResponse) {
    super(`transient internal response ${response.status}`);
    this.name = 'TransientInternalResponseError';
  }
}

export function isTransientStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export const INTERNAL_UNAVAILABLE_RESPONSE: ServiceResponse = {
  status: 503,
  body: { error: 'Internal service unavailable', kind: 'unavailable' },
};

/**
 * Explicit per-call timeout wins; otherwise apply the per-service env budget
 * (`TRAPMAP_<SVC>_TIMEOUT_MS`) when the hostname maps to a known service.
 */
