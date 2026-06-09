import { randomUUID } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { ServerConfig } from '@trapmap/server/config.js';

export interface RequestContext {
  requestId: string;
  traceHeaderName: string;
  traceId: string | null;
  method: string;
  route: string;
}

export function getOrCreateRequestContext(
  request: FastifyRequest,
  config: ServerConfig,
): RequestContext {
  const requestIdHeader = config.runtime.requestIdHeader.toLowerCase();
  const traceHeaderName = config.runtime.traceHeaderName.toLowerCase();
  const existingRequestId = request.headers[requestIdHeader];
  const existingTraceId = request.headers[traceHeaderName];

  const requestId =
    typeof existingRequestId === 'string' && existingRequestId.trim().length > 0
      ? existingRequestId.trim()
      : request.id || randomUUID();
  const traceId =
    typeof existingTraceId === 'string' && existingTraceId.trim().length > 0
      ? existingTraceId.trim()
      : null;

  const context: RequestContext = {
    requestId,
    traceHeaderName,
    traceId,
    method: request.method,
    route: request.routeOptions.url || request.url,
  };

  request.requestContext = context;
  return context;
}
