import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface NestRequestContext {
  requestId: string;
  traceId: string | null;
  traceHeaderName: string;
  method: string;
  route: string;
}

const storage = new AsyncLocalStorage<NestRequestContext>();

@Injectable()
export class RequestContextService {
  get(): NestRequestContext | undefined {
    return storage.getStore();
  }

  getOrThrow(): NestRequestContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error('RequestContext accessed outside request scope');
    }
    return ctx;
  }

  run<T>(context: NestRequestContext, fn: () => T): T {
    return storage.run(context, fn);
  }

  getRequestId(): string {
    return this.get()?.requestId ?? 'unknown';
  }

  getTraceId(): string | null {
    return this.get()?.traceId ?? null;
  }
}

/**
 * Extract or generate request context from an incoming Fastify request.
 * Uses the configured header names from ServerConfig.
 */
export function extractRequestContext(
  headers: Record<string, string | string[] | undefined>,
  config: { requestIdHeader: string; traceHeaderName: string },
  fallback: { method: string; route: string; existingId?: string },
): NestRequestContext {
  const reqIdHeader = config.requestIdHeader.toLowerCase();
  const traceHeader = config.traceHeaderName.toLowerCase();

  const existingRequestId = headers[reqIdHeader];
  const existingTraceId = headers[traceHeader];

  const requestId =
    typeof existingRequestId === 'string' && existingRequestId.trim().length > 0
      ? existingRequestId.trim()
      : fallback.existingId || randomUUID();

  const traceId =
    typeof existingTraceId === 'string' && existingTraceId.trim().length > 0
      ? existingTraceId.trim()
      : null;

  return {
    requestId,
    traceId,
    traceHeaderName: traceHeader,
    method: fallback.method,
    route: fallback.route,
  };
}
