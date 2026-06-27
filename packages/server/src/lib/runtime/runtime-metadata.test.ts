import { describe, expect, it } from 'vitest';

import type { ServerConfig } from '@trapmap/server/config.js';
import { resolveRuntimeDeployment } from './deployment-profile.js';
import { buildRuntimeStatusSnapshot, resolveAsyncWorkerState } from './runtime-metadata.js';
import { getServiceUnitProfile } from './service-unit.js';

const baseConfig = {
  runtime: {
    requestIdHeader: 'x-request-id',
    traceHeaderName: 'traceparent',
  },
} as ServerConfig;

function deployment(profile: 'local-agent' | 'team-monolith' | 'distributed') {
  return resolveRuntimeDeployment({
    profile,
    preset: profile === 'distributed' ? 'api' : 'monolith',
  });
}

describe('buildRuntimeStatusSnapshot', () => {
  it('reports ready when graph is disabled and queue worker is not configured', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'json-store',
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'local-agent',
        preset: 'monolith',
        runtimeMode: 'api',
        serviceUnit: 'full-platform',
      }),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'api'),
      queueWorkerState: 'not-configured',
      outboxWorkerState: 'not-configured',
      graphQuery: {
        mode: 'disabled',
        backendKind: 'memory',
        failOpen: true,
      },
    });

    expect(snapshot.liveness).toBe('alive');
    expect(snapshot.readiness).toBe('ready');
    expect(snapshot.dependencies).toMatchObject({
      database: 'json-store',
      queueWorker: 'not-configured',
      outboxWorker: 'not-configured',
      graphQuery: 'disabled',
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
      deployment: {
        profile: 'local-agent',
        routeSurface: 'gateway-core',
        storagePosture: 'json-store-ok',
        publicGatewayRouteCount: 52,
        internalRouteCount: 0,
      },
    });
    expect(snapshot.dependencies.deployment.routeFamilies).toEqual([
      expect.objectContaining({
        kind: 'gateway-api',
        audience: 'gateway-public',
      }),
    ]);
  });

  it('reports not-ready when a configured queue worker is stopped', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      runtimeDeployment: deployment('team-monolith'),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'combined'),
      queueWorkerState: 'degraded',
      outboxWorkerState: 'running',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('not-ready');
    expect(snapshot.dependencies.queueWorker).toBe('degraded');
  });

  it('reports degraded when graph backend is in fallback mode', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      runtimeDeployment: deployment('team-monolith'),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'combined'),
      queueWorkerState: 'running',
      outboxWorkerState: 'running',
      graphQuery: {
        mode: 'enabled-fallback',
        backendKind: 'neo4j',
        failOpen: true,
        detail: 'Neo4j unavailable, using memory fallback',
      },
    });

    expect(snapshot.readiness).toBe('degraded');
    expect(snapshot.dependencies.graphQuery).toBe('fallback');
    expect(snapshot.liveness).toBe('alive');
  });

  it('reports healthy graph when primary backend is enabled without detail', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      runtimeDeployment: deployment('team-monolith'),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'combined'),
      queueWorkerState: 'running',
      outboxWorkerState: 'running',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('ready');
    expect(snapshot.dependencies.graphQuery).toBe('healthy');
  });

  it('reports not-ready when configured outbox worker is stopped', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      runtimeDeployment: deployment('team-monolith'),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'combined'),
      queueWorkerState: 'running',
      outboxWorkerState: 'degraded',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('not-ready');
    expect(snapshot.dependencies.outboxWorker).toBe('degraded');
  });

  it('reports ready when postgres runtime is not expected to own workers locally', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'api',
      serviceUnit: 'knowledge-governance',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'distributed',
        preset: 'api',
        runtimeMode: 'api',
        serviceUnit: 'knowledge-governance',
      }),
      serviceUnitProfile: getServiceUnitProfile('knowledge-governance', 'api'),
      queueWorkerState: 'remote',
      outboxWorkerState: 'remote',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('ready');
    expect(snapshot.dependencies.queueWorker).toBe('remote');
    expect(snapshot.dependencies.outboxWorker).toBe('remote');
    expect(snapshot.dependencies.ownership).toEqual({
      queue: {
        ownsAny: false,
        ownsCandidateTaskWork: false,
        ownsSharedJobTaskWork: false,
      },
      outbox: {
        ownsAny: false,
        ownsOutboxWork: false,
      },
    });
    expect(snapshot.serviceUnit).toEqual({
      name: 'knowledge-governance',
      ownership: getServiceUnitProfile('knowledge-governance', 'api'),
    });
    expect(snapshot.deployment).toMatchObject({
      deploymentProfile: 'distributed',
      capabilities: {
        routeSurface: 'gateway-core',
        asyncOwnershipExpectation: 'remote-expected',
      },
    });
    expect(snapshot.dependencies.deployment).toMatchObject({
      publicGatewayRouteCount: expect.any(Number),
      internalRouteCount: 0,
    });
    expect(snapshot.dependencies.deployment.routeFamilies).toEqual([
      expect.objectContaining({
        kind: 'gateway-api',
        audience: 'gateway-public',
      }),
    ]);
    expect(snapshot.topology).toMatchObject({
      deploymentProfile: 'distributed',
      phase: 'shared-postgres-phase1',
      currentService: {
        name: 'gateway',
        surface: 'gateway-public',
        runtimeBoundary: 'dedicated-runtime',
        ownershipMode: 'remote-owner-expected',
      },
    });
    expect(snapshot.dependencies.topology).toEqual(snapshot.topology);
  });

  it('surfaces service-unit ownership for candidate-ingestion combined runtime', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'candidate-ingestion',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'team-monolith',
        preset: 'monolith',
        runtimeMode: 'combined',
        serviceUnit: 'candidate-ingestion',
      }),
      serviceUnitProfile: getServiceUnitProfile('candidate-ingestion', 'combined'),
      queueWorkerState: 'running',
      outboxWorkerState: 'remote',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.dependencies).toMatchObject({
      runtimeMode: 'combined',
      serviceUnit: 'candidate-ingestion',
      ownership: {
        queue: {
          ownsAny: true,
          ownsCandidateTaskWork: true,
          ownsSharedJobTaskWork: false,
        },
        outbox: {
          ownsAny: false,
          ownsOutboxWork: false,
        },
      },
    });
    expect(snapshot.serviceUnit).toEqual({
      name: 'candidate-ingestion',
      ownership: getServiceUnitProfile('candidate-ingestion', 'combined'),
    });
    expect(snapshot.topology.currentService).toMatchObject({
      name: 'candidate-ingestion',
      ownsCandidateTaskWork: true,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: false,
      runtimeBoundary: 'logical-service-boundary',
      ownershipMode: 'local-worker-owned',
    });
  });

  it('integrates distributed gateway topology with full shared infrastructure metadata', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'distributed',
        preset: 'api',
        runtimeMode: 'api',
        serviceUnit: 'full-platform',
      }),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'api'),
      queueWorkerState: 'remote',
      outboxWorkerState: 'remote',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.topology).toMatchObject({
      deploymentProfile: 'distributed',
      phase: 'shared-postgres-phase1',
      currentService: {
        name: 'gateway',
        surface: 'gateway-public',
      },
      sharedInfrastructure: [
        'postgresql',
        'shared-contracts',
        'auth-session-model',
        'queue-outbox-semantics',
      ],
      deferredIsolationBoundaries: [
        'per-service-database',
        'split-repository-packages',
        'service-mesh-event-backbone',
      ],
    });
    expect(snapshot.topology.distributedServices.map((service) => service.name)).toEqual([
      'gateway',
      'retrieval',
      'candidate-ingestion',
      'governance',
      'outbox-runtime',
    ]);
    expect(
      snapshot.topology.distributedServices.find((service) => service.name === 'retrieval'),
    ).toMatchObject({
      runtimeBoundary: 'logical-service-boundary',
      notes: expect.stringContaining('logical service boundary'),
    });
  });

  it('integrates distributed candidate worker ownership into topology and dependency state', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'task-worker',
      serviceUnit: 'candidate-ingestion',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'distributed',
        preset: 'candidate-worker',
        runtimeMode: 'task-worker',
        serviceUnit: 'candidate-ingestion',
      }),
      serviceUnitProfile: getServiceUnitProfile('candidate-ingestion', 'task-worker'),
      queueWorkerState: 'running',
      outboxWorkerState: 'remote',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('ready');
    expect(snapshot.dependencies).toMatchObject({
      runtimeMode: 'task-worker',
      queueWorker: 'running',
      outboxWorker: 'remote',
      ownership: {
        queue: {
          ownsAny: true,
          ownsCandidateTaskWork: true,
          ownsSharedJobTaskWork: false,
        },
        outbox: {
          ownsAny: false,
          ownsOutboxWork: false,
        },
      },
    });
    expect(snapshot.topology.currentService).toMatchObject({
      name: 'candidate-ingestion',
      surface: 'worker-internal',
      ownsCandidateTaskWork: true,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: false,
    });
  });

  it('integrates distributed outbox worker ownership into topology and dependency state', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'outbox-worker',
      serviceUnit: 'knowledge-governance',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'distributed',
        preset: 'outbox-worker',
        runtimeMode: 'outbox-worker',
        serviceUnit: 'knowledge-governance',
      }),
      serviceUnitProfile: getServiceUnitProfile('knowledge-governance', 'outbox-worker'),
      queueWorkerState: 'remote',
      outboxWorkerState: 'running',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('ready');
    expect(snapshot.dependencies).toMatchObject({
      runtimeMode: 'outbox-worker',
      queueWorker: 'remote',
      outboxWorker: 'running',
      ownership: {
        queue: {
          ownsAny: false,
          ownsCandidateTaskWork: false,
          ownsSharedJobTaskWork: false,
        },
        outbox: {
          ownsAny: true,
          ownsOutboxWork: true,
        },
      },
    });
    expect(snapshot.topology.currentService).toMatchObject({
      name: 'outbox-runtime',
      surface: 'worker-internal',
      ownsCandidateTaskWork: false,
      ownsSharedJobTaskWork: false,
      ownsOutboxWork: true,
    });
  });

  it('integrates local-agent topology as the minimal gateway-only service set', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'json-store',
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'local-agent',
        preset: 'monolith',
        runtimeMode: 'api',
        serviceUnit: 'full-platform',
      }),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'api'),
      queueWorkerState: 'not-configured',
      outboxWorkerState: 'not-configured',
      graphQuery: {
        mode: 'disabled',
        backendKind: 'memory',
        failOpen: true,
      },
    });

    expect(snapshot.topology).toMatchObject({
      deploymentProfile: 'local-agent',
      phase: 'shared-postgres-phase1',
      currentService: {
        name: 'gateway',
        surface: 'gateway-public',
        routeFamilies: ['gateway-api'],
      },
    });
    expect(snapshot.dependencies.deployment).toMatchObject({
      profile: 'local-agent',
      routeSurface: 'gateway-core',
      publicGatewayRouteCount: 52,
      internalRouteCount: 0,
    });
  });

  it('integrates team-monolith topology as a gateway process with shared local ownership', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      runtimeDeployment: resolveRuntimeDeployment({
        profile: 'team-monolith',
        preset: 'monolith',
        runtimeMode: 'combined',
        serviceUnit: 'full-platform',
      }),
      serviceUnitProfile: getServiceUnitProfile('full-platform', 'combined'),
      queueWorkerState: 'running',
      outboxWorkerState: 'running',
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.topology).toMatchObject({
      deploymentProfile: 'team-monolith',
      phase: 'shared-postgres-phase1',
      currentService: {
        name: 'gateway',
        surface: 'gateway-public',
        ownsCandidateTaskWork: true,
        ownsSharedJobTaskWork: true,
        ownsOutboxWork: true,
      },
    });
    expect(snapshot.dependencies).toMatchObject({
      queueWorker: 'running',
      outboxWorker: 'running',
      ownership: {
        queue: {
          ownsAny: true,
          ownsCandidateTaskWork: true,
          ownsSharedJobTaskWork: true,
        },
        outbox: {
          ownsAny: true,
          ownsOutboxWork: true,
        },
      },
    });
  });

  it('distinguishes remote ownership from not-configured based on runtime mode and database', () => {
    expect(
      resolveAsyncWorkerState({
        database: 'postgres',
        runtimeMode: 'api',
        workerKind: 'queue',
        owner: false,
        running: false,
      }),
    ).toBe('remote');

    expect(
      resolveAsyncWorkerState({
        database: 'json-store',
        runtimeMode: 'api',
        workerKind: 'queue',
        owner: false,
        running: false,
      }),
    ).toBe('not-configured');
  });

  it('treats explicit non-owner workers as remote even when a local runtime handle exists', () => {
    expect(
      resolveAsyncWorkerState({
        database: 'postgres',
        runtimeMode: 'combined',
        workerKind: 'queue',
        owner: false,
        running: true,
      }),
    ).toBe('remote');
  });

  it('treats owning but stopped workers as degraded infrastructure state', () => {
    expect(
      resolveAsyncWorkerState({
        database: 'postgres',
        runtimeMode: 'outbox-worker',
        workerKind: 'outbox',
        owner: true,
        running: false,
      }),
    ).toBe('degraded');
  });
});
