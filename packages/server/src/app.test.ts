import { describe, expect, it, vi } from 'vitest';

import { buildPostgresTestServer as buildServer } from '../../../scripts/testing/server-test-composition.js';
import { recordRuntimeExecution, resetRuntimeMetrics } from './lib/runtime/index.js';

describe('app.ts live gaps — fm-agent raw report', () => {
  it('exports prometheus metrics with frozen trapmap namespaces and low-cardinality labels', async () => {
    resetRuntimeMetrics();
    recordRuntimeExecution({
      dependencyName: 'queue-runtime',
      latencyMs: 25,
      failureKind: 'timeout',
    });

    const app = await buildServer();
    await app.ready();

    await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'req_metrics_1',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('trapmap_runtime_executions_total');
    expect(response.body).toContain('dependency_name="queue-runtime"');
    expect(response.body).toContain('failure_classification="timeout"');
    expect(response.body).toContain('trapmap_runtime_request_duration_ms_count');
    expect(response.body).toContain('route_family="runtime"');
    expect(response.body).not.toContain('requestId=');
    expect(response.body).not.toContain('traceId=');

    await app.close();
  });

  it('logs structured request fields including requestId traceId and serviceName', async () => {
    const app = await buildServer();
    await app.ready();

    const infoSpy = vi.spyOn(app.log, 'info');

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'req_log_2',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: 'request',
        eventName: 'request.completed',
        requestId: 'req_log_2',
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        serviceName: 'gateway',
        ownerSurface: 'runtime-seam',
        routeFamily: 'runtime',
      }),
      'Request completed',
    );

    await app.close();
  });

  it('fm-agent: onClose awaits async worker shutdown before resolving', async () => {
    const app = await buildServer();
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
    const app = await buildServer();
    await app.ready();

    const frozen = Object.isFrozen(app.skillShareer);

    expect(frozen).toBe(true);

    await app.close();
  });

  it('keeps the compatibility store readable after owner migrations', async () => {
    const app = await buildServer();

    await expect(app.skillShareer.store.snapshot()).resolves.toEqual(expect.any(Object));

    await app.close();
  });

  it('exposes graph query runtime state from /ready', async () => {
    const app = await buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      readiness: 'ready',
      // Contract-shaped dependencies (array of DependencyStatus)
      dependencies: expect.arrayContaining([
        expect.objectContaining({ name: 'database', status: expect.any(String) }),
        expect.objectContaining({ name: 'queue-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'outbox-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'graph-query', status: expect.any(String) }),
      ]),
      snapshot: {
        serviceUnit: {
          name: 'full-platform',
        },
        requestContext: {
          requestIdHeader: 'x-request-id',
          traceHeader: 'traceparent',
        },
        graphQuery: {
          mode: 'disabled',
          backendKind: 'memory',
        },
      },
    });

    await app.close();
  });

  it('includes graph query runtime state in /health output', async () => {
    const app = await buildServer();
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
      // Contract-shaped dependencies (array of DependencyStatus)
      dependencies: expect.arrayContaining([
        expect.objectContaining({ name: 'database', status: expect.any(String) }),
        expect.objectContaining({ name: 'queue-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'outbox-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'graph-query', status: expect.any(String) }),
      ]),
      snapshot: {
        serviceUnit: {
          name: 'full-platform',
        },
        requestContext: {
          requestIdHeader: 'x-request-id',
          traceHeader: 'traceparent',
        },
        topology: {
          deploymentProfile: 'team-monolith',
          phase: 'shared-postgres-phase1',
          currentService: {
            name: 'gateway',
            surface: 'gateway-public',
          },
        },
        graphQuery: {
          mode: 'disabled',
          backendKind: 'memory',
        },
      },
    });

    await app.close();
  });

  it('echoes request id header and keeps upstream trace header', async () => {
    const app = await buildServer();
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
    const app = await buildServer();
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
    const app = await buildServer({
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
      snapshot: {
        requestContext: {
          requestIdHeader: 'x-correlation-id',
          traceHeader: 'x-trace-id',
        },
      },
    });

    await app.close();
  });

  it('reports degraded readiness when graph query is in fallback mode', async () => {
    const app = await buildServer();
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
      snapshot: {
        graphQuery: {
          mode: 'enabled-fallback',
          backendKind: 'neo4j',
        },
      },
    });

    await app.close();
  });

  it('returns 503 when readiness is not-ready', async () => {
    const app = await buildServer();
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
    });

    await app.close();
  });

  it('keeps readiness successful when this process does not own async workers', async () => {
    const app = await buildServer({ runtimeMode: 'api' });
    await app.ready();
    app.taskWorker = {
      isRunning: () => false,
      ownsWork: () => false,
      stop: async () => {},
    };
    app.outboxWorker = {
      isRunning: () => false,
      ownsWork: () => false,
      stop: async () => {},
    };

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      dependencies: expect.arrayContaining([
        expect.objectContaining({ name: 'queue-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'outbox-worker', status: expect.any(String) }),
      ]),
    });

    await app.close();
  });

  it('api-only runtime does not require worker health', async () => {
    const app = await buildServer({ runtimeMode: 'api' });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      dependencies: expect.arrayContaining([
        expect.objectContaining({ name: 'queue-worker', status: 'unknown' }),
        expect.objectContaining({ name: 'outbox-worker', status: 'unknown' }),
      ]),
    });

    await app.close();
  });

  it('worker-only runtime remains request-ready with PostgreSQL composition', async () => {
    const taskWorkerApp = await buildServer({ runtimeMode: 'task-worker' });
    await taskWorkerApp.ready();
    const taskWorkerReady = await taskWorkerApp.inject({ method: 'GET', url: '/ready' });
    expect(taskWorkerReady.statusCode).toBe(200);
    expect(taskWorkerReady.json()).toMatchObject({
      dependencies: expect.arrayContaining([
        expect.objectContaining({ name: 'queue-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'outbox-worker', status: expect.any(String) }),
      ]),
    });
    await taskWorkerApp.close();

    const outboxWorkerApp = await buildServer({ runtimeMode: 'outbox-worker' });
    await outboxWorkerApp.ready();
    const outboxWorkerReady = await outboxWorkerApp.inject({ method: 'GET', url: '/ready' });
    expect(outboxWorkerReady.statusCode).toBe(200);
    expect(outboxWorkerReady.json()).toMatchObject({
      dependencies: expect.arrayContaining([
        expect.objectContaining({ name: 'queue-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'outbox-worker', status: expect.any(String) }),
      ]),
    });
    await outboxWorkerApp.close();
  });

  it('local-agent exposes the governance-capable gateway surface', async () => {
    const app = await buildServer({
      config: {
        deployment: {
          profile: 'local-agent',
          preset: 'monolith',
          compatibility: {
            profile: 'local-agent',
            source: 'explicit',
            requiresGateway: true,
            requiresAsyncOwnership: false,
            allowsSingleProcess: true,
            requiresPostgres: false,
            minimumPreset: 'monolith',
          },
          resolved: undefined as never,
        },
      } as any,
    });
    await app.ready();

    const routes = await app.inject({ method: 'GET', url: '/meta/routes' });
    expect(routes.statusCode).toBe(200);
    expect(routes.json()).toMatchObject({
      routeSurface: 'gateway-core',
      publicGatewayRouteCount: expect.any(Number),
      internalRouteCount: 0,
      topology: {
        deploymentProfile: 'local-agent',
        phase: 'shared-postgres-phase1',
        currentService: {
          name: 'gateway',
          surface: 'gateway-public',
        },
      },
      routeFamilies: [
        {
          kind: 'gateway-api',
          audience: 'gateway-public',
        },
      ],
    });
    expect(routes.json().documentedRoutes).toContain('POST /v1/feedback');
    expect(routes.json().documentedRoutes).toContain('GET /v1/duplicates');

    const authResponse = await app.inject({ method: 'GET', url: '/v1/auth/session' });
    expect(authResponse.statusCode).not.toBe(501);

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ok: true,
      snapshot: {
        topology: {
          deploymentProfile: 'local-agent',
          phase: 'shared-postgres-phase1',
          currentService: {
            name: 'gateway',
            surface: 'gateway-public',
          },
        },
      },
    });

    await app.close();
  });

  it('team-monolith health exposes shared gateway topology with local worker ownership', async () => {
    const app = await buildServer();
    await app.ready();
    const taskWorker = app.taskWorker;
    const outboxWorker = app.outboxWorker;
    app.taskWorker = {
      isRunning: () => true,
      ownsWork: () => true,
      stop: async () => {
        await taskWorker?.stop?.();
      },
    };
    app.outboxWorker = {
      isRunning: () => true,
      ownsWork: () => true,
      stop: async () => {
        await outboxWorker?.stop?.();
      },
    };

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      snapshot: {
        topology: {
          deploymentProfile: 'team-monolith',
          phase: 'shared-postgres-phase1',
          currentService: {
            name: 'gateway',
            surface: 'gateway-public',
            ownsCandidateTaskWork: true,
            ownsSharedJobTaskWork: true,
            ownsOutboxWork: true,
          },
        },
      },
      dependencies: expect.arrayContaining([
        expect.objectContaining({ name: 'queue-worker', status: expect.any(String) }),
        expect.objectContaining({ name: 'outbox-worker', status: expect.any(String) }),
      ]),
    });

    await app.close();
  });

  it('distributed worker profile does not expose gateway business routes', async () => {
    const app = await buildServer({
      runtimeMode: 'task-worker',
      serviceUnit: 'candidate-ingestion',
      config: {
        deployment: {
          profile: 'distributed',
          preset: 'candidate-worker',
          compatibility: {
            profile: 'distributed',
            source: 'explicit',
            requiresGateway: true,
            requiresAsyncOwnership: true,
            allowsSingleProcess: false,
            requiresPostgres: true,
            minimumPreset: 'api',
          },
          resolved: undefined as never,
        },
      } as any,
    });
    await app.ready();

    const routes = await app.inject({ method: 'GET', url: '/meta/routes' });
    expect(routes.statusCode).toBe(200);
    expect(routes.json()).toMatchObject({
      routeSurface: 'worker-status',
      documentedRoutes: [],
      publicGatewayRouteCount: 0,
      internalRouteCount: 3,
      topology: {
        deploymentProfile: 'distributed',
        phase: 'shared-postgres-phase1',
        currentService: {
          name: 'candidate-ingestion',
          surface: 'worker-internal',
          ownsCandidateTaskWork: true,
          ownsSharedJobTaskWork: false,
          ownsOutboxWork: false,
        },
      },
      routeFamilies: [
        {
          kind: 'worker-status',
          audience: 'internal-status',
        },
      ],
    });

    const retrievalResponse = await app.inject({
      method: 'POST',
      url: '/v1/retrieval/search',
      payload: { query: 'test' },
    });
    expect(retrievalResponse.statusCode).toBe(501);
    expect(retrievalResponse.json()).toMatchObject({
      code: 'capability_unsupported',
      message: expect.stringContaining('distributed gateway'),
    });

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      snapshot: {
        topology: {
          currentService: {
            name: 'candidate-ingestion',
          },
        },
      },
    });

    await app.close();
  });

  it('distributed gateway readiness exposes shared-postgres phase1 topology', async () => {
    const app = await buildServer({
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
      config: {
        deployment: {
          profile: 'distributed',
          preset: 'api',
          compatibility: {
            profile: 'distributed',
            source: 'explicit',
            requiresGateway: true,
            requiresAsyncOwnership: true,
            allowsSingleProcess: false,
            requiresPostgres: true,
            minimumPreset: 'api',
          },
          resolved: undefined as never,
        },
      } as any,
    });
    await app.ready();

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      ok: true,
      snapshot: {
        topology: {
          deploymentProfile: 'distributed',
          phase: 'shared-postgres-phase1',
          currentService: {
            name: 'gateway',
            surface: 'gateway-public',
            ownsCandidateTaskWork: false,
            ownsSharedJobTaskWork: false,
            ownsOutboxWork: false,
          },
        },
      },
    });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      snapshot: {
        topology: {
          deploymentProfile: 'distributed',
          currentService: {
            name: 'gateway',
          },
        },
      },
    });

    await app.close();
  });

  it('service units remain request-ready with PostgreSQL composition', async () => {
    const candidateIngestionApp = await buildServer({
      runtimeMode: 'combined',
      serviceUnit: 'candidate-ingestion',
    });
    await candidateIngestionApp.ready();
    const candidateIngestionReady = await candidateIngestionApp.inject({
      method: 'GET',
      url: '/ready',
    });
    expect(candidateIngestionReady.statusCode).toBe(200);
    expect(candidateIngestionReady.json()).toMatchObject({
      snapshot: {
        serviceUnit: {
          name: 'candidate-ingestion',
          ownership: {
            ownsCandidateTaskWork: true,
            ownsSharedJobTaskWork: false,
            ownsOutboxWork: false,
          },
        },
      },
    });
    await candidateIngestionApp.close();

    const knowledgeGovernanceApp = await buildServer({
      runtimeMode: 'combined',
      serviceUnit: 'knowledge-governance',
    });
    await knowledgeGovernanceApp.ready();
    const knowledgeGovernanceReady = await knowledgeGovernanceApp.inject({
      method: 'GET',
      url: '/ready',
    });
    expect(knowledgeGovernanceReady.statusCode).toBe(200);
    expect(knowledgeGovernanceReady.json()).toMatchObject({
      snapshot: {
        serviceUnit: {
          name: 'knowledge-governance',
          ownership: {
            ownsCandidateTaskWork: false,
            ownsSharedJobTaskWork: true,
            ownsOutboxWork: true,
          },
        },
      },
    });
    await knowledgeGovernanceApp.close();
  });

  it('logs request-context metadata on unhandled errors', async () => {
    const app = await buildServer();
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

  // -----------------------------------------------------------------------
  // Phase 2B: X-Trace-Id response header injection
  // -----------------------------------------------------------------------

  it('injects X-Trace-Id response header when traceparent is present', async () => {
    const app = await buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-trace-id']).toBe('4bf92f3577b34da6a3ce929d0e0e4736');

    await app.close();
  });

  it('does not emit X-Trace-Id when no traceparent header is present and tracing is disabled', async () => {
    const app = await buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-trace-id']).toBeUndefined();

    await app.close();
  });

  it('includes traceId in structured log on request completion (Phase 2B)', async () => {
    const app = await buildServer();
    await app.ready();

    const infoSpy = vi.spyOn(app.log, 'info');

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': 'req_trace_log',
        traceparent: '00-abcdef1234567890abcdef1234567890-00f067aa0ba902b7-00',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCategory: 'request',
        eventName: 'request.completed',
        traceId: 'abcdef1234567890abcdef1234567890',
        requestId: 'req_trace_log',
      }),
      'Request completed',
    );

    await app.close();
  });
});
