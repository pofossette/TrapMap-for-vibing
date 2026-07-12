import { randomUUID } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { ServerConfig } from '@trapmap/server/config.js';
import {
  CAUSATION_ID_HEADER,
  extractTraceIdFromTraceparent,
  OPERATION_ID_HEADER,
} from '@trapmap/contracts';

export interface RequestContext {
  requestId: string;
  traceHeaderName: string;
  traceHeaderValue: string | null;
  traceId: string | null;
  traceParent: string | null;
  operationId?: string;
  causationId?: string;
  method: string;
  route: string;
}

function readOptionalHeader(header: string | string[] | undefined): string | undefined {
  return typeof header === 'string' && header.trim().length > 0 ? header.trim() : undefined;
}

export function getOrCreateRequestContext(
  request: FastifyRequest,
  config: ServerConfig,
): RequestContext {
  const requestIdHeader = config.runtime.requestIdHeader.toLowerCase();
  const traceHeaderName = config.runtime.traceHeaderName.toLowerCase();
  const existingRequestId = request.headers[requestIdHeader];
  const existingTraceId = request.headers[traceHeaderName];
  const traceParent = readOptionalHeader(existingTraceId);
  const traceId = traceParent ? extractTraceIdFromTraceparent(traceParent) : null;
  const operationId = readOptionalHeader(request.headers[OPERATION_ID_HEADER]) ?? randomUUID();
  const causationId = readOptionalHeader(request.headers[CAUSATION_ID_HEADER]);

  const requestId =
    typeof existingRequestId === 'string' && existingRequestId.trim().length > 0
      ? existingRequestId.trim()
      : request.id || randomUUID();
  const context: RequestContext = {
    requestId,
    traceHeaderName,
    traceHeaderValue: traceParent ?? null,
    traceId,
    traceParent: traceId ? traceParent : null,
    operationId,
    ...(causationId && { causationId }),
    method: request.method,
    route: request.routeOptions.url || request.url,
  };

  request.requestContext = context;
  return context;
}
