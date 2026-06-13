import { describe, expect, it, vi } from 'vitest';

import { buildServer } from './app.js';

describe('app.ts live gaps — fm-agent raw report', () => {
  it('fm-agent: onClose awaits async worker shutdown before resolving', async () => {
    const app = buildServer();
    const events: string[] = [];

    (app as any).taskWorker = {
      stop: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push('task-stopped');
      },
    };
    (app as any).outboxWorker = {
      stop: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push('outbox-stopped');
      },
    };

    await app.close();

    expect(events).toContain('task-stopped');
    expect(events).toContain('outbox-stopped');
  });

  it('fm-agent: app.skillShareer is frozen to prevent mutation', async () => {
    const app = buildServer();
    await app.ready();

    const frozen = Object.isFrozen(app.skillShareer);

    expect(frozen).toBe(true);

    await app.close();
  });

  it('exposes graph query runtime state from /ready', async () => {
    const app = buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      readiness: 'ready',
      requestContext: {
        requestIdHeader: 'x-request-id',
        traceHeader: 'traceparent',
      },
      dependencies: {
        database: 'json-store',
        queueWorker: 'not-configured',
        outboxWorker: 'not-configured',
        graphQuery: 'disabled',
      },
      graphQuery: {
        mode: 'disabled',
        backendKind: 'memory',
      },
    });

    await app.close();
  });

  it('includes graph query runtime state in /health output', async () => {
    const app = buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      liveness: 'alive',
      readiness: 'ready',
      requestContext: {
        requestIdHeader: 'x-request-id',
        traceHeader: 'traceparent',
      },
      dependencies: {
        database: 'json-store',
        queueWorker: 'not-configured',
        outboxWorker: 'not-configured',
        graphQuery: 'disabled',
      },
      graphQuery: {
        mode: 'disabled',
        backendKind: 'memory',
      },
    });

    await app.close();
  });

  it('echoes request id header and keeps upstream trace header', async () => {
    const app = buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'req_phase1',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('req_phase1');
    expect(response.headers.traceparent).toBe(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
    );

    await app.close();
  });

  it('generates request id when header is absent and does not emit trace header by default', async () => {
    const app = buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(response.headers.traceparent).toBeUndefined();

    await app.close();
  });

  it('uses custom configured request and trace headers end-to-end', async () => {
    const app = buildServer({
      config: {
        runtime: {
          requestIdHeader: 'x-correlation-id',
          traceHeaderName: 'x-trace-id',
        },
      },
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-correlation-id': 'corr_123',
        'x-trace-id': 'trace_456',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('corr_123');
    expect(response.headers['x-trace-id']).toBe('trace_456');
    expect(response.json()).toMatchObject({
      requestContext: {
        requestIdHeader: 'x-correlation-id',
        traceHeader: 'x-trace-id',
      },
    });

    await app.close();
  });

  it('reports degraded readiness when graph query is in fallback mode', async () => {
    const app = buildServer();
    await app.ready();
    (app.skillShareer.graphQueryBackend as { getRuntimeState: () => unknown }).getRuntimeState =
      () => ({
        mode: 'enabled-fallback',
        backendKind: 'neo4j',
        failOpen: true,
        detail: 'fallback active',
      });

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      liveness: 'alive',
      readiness: 'degraded',
      dependencies: {
        graphQuery: 'fallback',
      },
      graphQuery: {
        mode: 'enabled-fallback',
        backendKind: 'neo4j',
      },
    });

    await app.close();
  });

  it('returns 503 when readiness is not-ready', async () => {
    const app = buildServer();
    await app.ready();
    (app.skillShareer.graphQueryBackend as { getRuntimeState: () => unknown }).getRuntimeState =
      () => ({
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: false,
        detail: 'primary backend failed',
      });

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      ok: false,
      readiness: 'not-ready',
      dependencies: {
        graphQuery: 'failed',
      },
    });

    await app.close();
  });

  it('keeps readiness successful when this process does not own async workers', async () => {
    const app = buildServer({ runtimeMode: 'api' });
    await app.ready();
    (app as any).taskWorker = {
      isRunning: () => false,
      ownsWork: () => false,
    };
    (app as any).outboxWorker = {
      isRunning: () => false,
      ownsWork: () => false,
    };

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      dependencies: {
        queueWorker: 'not-configured',
        outboxWorker: 'not-configured',
      },
    });

    await app.close();
  });

  it('api-only runtime does not require worker health', async () => {
    const app = buildServer({ runtimeMode: 'api' });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      dependencies: {
        queueWorker: 'not-configured',
        outboxWorker: 'not-configured',
      },
    });

    await app.close();
  });

  it('worker-only runtime remains request-ready in json-store mode', async () => {
    const taskWorkerApp = buildServer({ runtimeMode: 'task-worker' });
    await taskWorkerApp.ready();
    const taskWorkerReady = await taskWorkerApp.inject({ method: 'GET', url: '/ready' });
    expect(taskWorkerReady.statusCode).toBe(200);
    expect(taskWorkerReady.json()).toMatchObject({
      dependencies: {
        queueWorker: 'not-configured',
        outboxWorker: 'not-configured',
      },
    });
    await taskWorkerApp.close();

    const outboxWorkerApp = buildServer({ runtimeMode: 'outbox-worker' });
    await outboxWorkerApp.ready();
    const outboxWorkerReady = await outboxWorkerApp.inject({ method: 'GET', url: '/ready' });
    expect(outboxWorkerReady.statusCode).toBe(200);
    expect(outboxWorkerReady.json()).toMatchObject({
      dependencies: {
        queueWorker: 'not-configured',
        outboxWorker: 'not-configured',
      },
    });
    await outboxWorkerApp.close();
  });

  it('logs request-context metadata on unhandled errors', async () => {
    const app = buildServer();
    app.get('/__phase1-error', async () => {
      throw new Error('boom');
    });
    await app.ready();

    const logSpy = vi.spyOn(app.log, 'error');
    const response = await app.inject({
      method: 'GET',
      url: '/__phase1-error',
      headers: {
        'x-request-id': 'req_log_1',
      },
    });

    expect(response.statusCode).toBe(500);
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_log_1',
        route: '/__phase1-error',
      }),
      'Unhandled server error',
    );

    await app.close();
  });
});
