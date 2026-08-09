import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  CAUSATION_ID_HEADER,
  OPERATION_ID_HEADER,
  extractTraceIdFromTraceparent,
} from '@trapmap/contracts';

export interface NestRequestContext {
  requestId: string;
  traceId: string | null;
  traceParent: string | null;
  traceHeaderName: string;
  operationId?: string;
  causationId?: string;
  method: string;
  route: string;
}

const storage = new AsyncLocalStorage<NestRequestContext>();

/**
 * Read the current request context from AsyncLocalStorage.
 *
 * This function is safe to call from any code running within a request
 * scope (e.g. the observation wrapper in shared-infra.ts). Returns
 * undefined when called outside a request scope.
 */
export function getCurrentRequestContext(): NestRequestContext | undefined {
  return storage.getStore();
}

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
 * Uses the configured header names from the host-local config seam.
 */
export function extractRequestContext(
  headers: Record<string, string | string[] | undefined>,
  config: { requestIdHeader: string; traceHeaderName: string },
  fallback: { method: string; route: string; existingId?: string },
): NestRequestContext {
  const reqIdHeader = config.requestIdHeader.toLowerCase();
  const traceHeader = config.traceHeaderName.toLowerCase();

  const existingRequestId = headers[reqIdHeader];
  const traceParent = readOptionalHeader(headers[traceHeader]);
  const traceId = traceParent ? extractTraceIdFromTraceparent(traceParent) : null;
  const operationId = readOptionalHeader(headers[OPERATION_ID_HEADER]) ?? randomUUID();
  const causationId = readOptionalHeader(headers[CAUSATION_ID_HEADER]);

  const requestId =
    typeof existingRequestId === 'string' && existingRequestId.trim().length > 0
      ? existingRequestId.trim()
      : fallback.existingId || randomUUID();

  return {
    requestId,
    traceId,
    traceParent: traceId ? (traceParent ?? null) : null,
    traceHeaderName: traceHeader,
    operationId,
    ...(causationId && { causationId }),
    method: fallback.method,
    route: fallback.route,
  };
}

function readOptionalHeader(header: string | string[] | undefined): string | undefined {
  return typeof header === 'string' && header.trim().length > 0 ? header.trim() : undefined;
}
