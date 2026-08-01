import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { ConsulDiscoveryAdapter } from './consul-discovery-adapter.js';
import { createServer } from './server.js';

function createConfig(): ServiceConfig {
  return {
    serviceName: 'gateway',
    port: 4000,
    host: '127.0.0.1',
    advertiseHost: '127.0.0.1',
    logLevel: 'info',
    databaseUrl: null,
    poolSize: 5,
    internalUrls: {
      gateway: 'http://127.0.0.1:4000',
      identityAccess: 'http://127.0.0.1:4001',
      knowledgeRead: 'http://127.0.0.1:4002',
      knowledgeWrite: 'http://127.0.0.1:4003',
      candidateIngestion: 'http://127.0.0.1:4004',
      review: 'http://127.0.0.1:4005',
      governanceReview: 'http://127.0.0.1:4005',
      jobRuntime: 'http://127.0.0.1:4006',
    },
    internalTransports: {
      knowledgeWrite: 'http',
    },
    consulEnabled: false,
    consulAddress: 'http://127.0.0.1:8500',
  };
}

describe('createServer observability surface', () => {
  it('owns the gateway request-context type instead of importing the compatibility server', async () => {
    const source = await readFile(path.join(import.meta.dirname, 'server.ts'), 'utf8');

    expect(source).not.toContain('@trapmap/server/lib/runtime/index.js');
    expect(source).toContain('interface GatewayRequestContext');
  });

  it('echoes request correlation headers from /health', async () => {
    const server = await createServer(createConfig());
    await server.app.ready();

    const response = await server.app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'test-req-001',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('test-req-001');
    expect(response.headers.traceparent).toBe(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    );

    await server.close();
  });

  it('does not emit a trace header when the gateway receives none', async () => {
    const server = await createServer(createConfig());
    await server.app.ready();

    const response = await server.app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers.traceparent).toBeUndefined();
    await server.close();
  });

  it('serves prometheus metrics anonymously from /metrics', async () => {
    const server = await createServer(createConfig());
    await server.app.ready();

    await server.app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'metrics-req-001',
      },
    });

    const response = await server.app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('trapmap_runtime_http_requests_total');
    expect(response.body).toContain('trapmap_process_resident_memory_bytes');
    expect(response.body).toContain('trapmap_nodejs_heap_size_used_bytes');
    expect(response.body).toContain('trapmap_nodejs_heap_size_total_bytes');
    expect(response.body).toContain('service_name="gateway"');
    expect(response.body).toContain('route_family="runtime"');

    await server.close();
  });

  it('logs structured request completion fields including requestId and traceId', async () => {
    const server = await createServer(createConfig());
    await server.app.ready();
    const infoSpy = vi.spyOn(server.app.log, 'info');

    const response = await server.app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'test-req-structured-log',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: 'request',
        eventName: 'request.completed',
        requestId: 'test-req-structured-log',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        service: 'gateway',
        serviceName: 'gateway',
        ownerSurface: 'runtime-seam',
        routeFamily: 'runtime',
      }),
      'Request completed',
    );

    await server.close();
  });

  it('registers Consul using advertiseHost instead of the bind host', async () => {
    const registerSpy = vi
      .spyOn(ConsulDiscoveryAdapter.prototype, 'register')
      .mockResolvedValue(undefined);
    const config: ServiceConfig = {
      ...createConfig(),
      host: '0.0.0.0',
      advertiseHost: 'gateway',
      consulEnabled: true,
    };

    const server = await createServer(config);

    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'gateway',
        check: expect.objectContaining({
          http: 'http://gateway:4000/health',
        }),
      }),
    );

    registerSpy.mockRestore();
    await server.close();
  });
});
