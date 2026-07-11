import { describe, expect, it } from 'vitest';

import type { ServerConfig } from '@trapmap/server/config.js';

import { getOrCreateRequestContext } from './request-context.js';

const config = {
  runtime: {
    requestIdHeader: 'x-request-id',
    traceHeaderName: 'traceparent',
  },
} as ServerConfig;

function request(headers: Record<string, string> = {}) {
  return {
    headers,
    id: 'fastify-request-id',
    method: 'GET',
    routeOptions: { url: '/health' },
    url: '/health',
  } as never;
}

describe('getOrCreateRequestContext', () => {
  it('preserves valid correlation headers', () => {
    const context = getOrCreateRequestContext(
      request({
        'x-request-id': ' incoming-request-id ',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        'x-trapmap-operation-id': 'operation_1',
        'x-trapmap-causation-id': 'event_1',
      }),
      config,
    );

    expect(context).toMatchObject({
      requestId: 'incoming-request-id',
      traceParent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      operationId: 'operation_1',
      causationId: 'event_1',
    });
  });

  it('uses the Fastify fallback and leaves absent correlation fields undefined', () => {
    const context = getOrCreateRequestContext(request(), config);

    expect(context.requestId).toBe('fastify-request-id');
    expect(context.traceParent).toBeNull();
    expect(context.traceId).toBeNull();
    expect(context.operationId).toBeUndefined();
    expect(context.causationId).toBeUndefined();
  });

  it('treats an invalid traceparent as absent', () => {
    const context = getOrCreateRequestContext(request({ traceparent: 'trace-abc' }), config);

    expect(context.traceParent).toBeNull();
    expect(context.traceId).toBeNull();
  });
});
