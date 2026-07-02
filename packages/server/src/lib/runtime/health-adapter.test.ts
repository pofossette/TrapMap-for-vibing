import { healthStatusSchema } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import type { RuntimeStatusSnapshot } from './runtime-metadata.js';
import { toHealthStatus, livenessTimestamp } from './health-adapter.js';

function baseSnapshot(overrides: Partial<RuntimeStatusSnapshot> = {}): RuntimeStatusSnapshot {
  return {
    liveness: 'alive',
    readiness: 'ready',
    product: 'trapmap',
    packages: ['cli', 'server', 'contracts'],
    requestContext: {
      requestIdHeader: 'x-request-id',
      traceHeader: null,
    },
    dependencies: {
      database: 'postgres',
      queueWorker: 'running',
      outboxWorker: 'running',
      graphQuery: 'healthy',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
      deployment: {
        profile: 'team-monolith',
        preset: 'monolith',
        routeSurface: 'gateway-core',
        routeFamilies: [],
        asyncOwnershipExpectation: 'primary',
        storagePosture: 'ephemeral',
        authTeamExpectation: 'required',
        publicGatewayRouteCount: 5,
        internalRouteCount: 2,
      },
      ownership: {
        queue: {
          ownsAny: true,
          ownsCandidateTaskWork: true,
          ownsSharedJobTaskWork: false,
        },
        outbox: {
          ownsAny: true,
          ownsOutboxWork: true,
        },
      },
      topology: {
        serviceUnit: 'full-platform',
        runtimeMode: 'combined',
        routes: [],
      },
    },
    graphQuery: {
      mode: 'enabled',
      backendKind: 'memory',
      failOpen: true,
    },
    deployment: {
      deploymentProfile: 'team-monolith',
      preset: 'monolith',
      capabilities: {
        routeSurface: 'gateway-core',
        asyncOwnershipExpectation: 'primary',
        storagePosture: 'ephemeral',
        authTeamExpectation: 'required',
      },
    } as unknown as RuntimeStatusSnapshot['deployment'],
    serviceUnit: {
      name: 'full-platform',
      ownership: {
        ownsCandidateTaskWork: true,
        ownsSharedJobTaskWork: false,
        ownsOutboxWork: true,
      },
    },
    topology: {
      serviceUnit: 'full-platform',
      runtimeMode: 'combined',
      routes: [],
    },
    memory: {
      rssMb: 100,
      heapUsedMb: 50,
      heapTotalMb: 80,
    },
    uptimeSeconds: 120,
    ...overrides,
  };
}

describe('toHealthStatus', () => {
  it('maps a ready snapshot to an ok HealthStatus that passes schema validation', () => {
    const snapshot = baseSnapshot();
    const result = toHealthStatus(snapshot);

    expect(result.status).toBe('ok');
    expect(result.readiness).toBe('ready');
    expect(result.liveness).toBe('alive');
    expect(result.uptime).toBe(120);
    expect(result.startedAt).toBeTruthy();
    expect(result.timestamp).toBeTruthy();

    const parsed = healthStatusSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('maps a not-ready snapshot to unhealthy', () => {
    const snapshot = baseSnapshot({ readiness: 'not-ready' });
    const result = toHealthStatus(snapshot);

    expect(result.status).toBe('unhealthy');
    expect(result.readiness).toBe('not-ready');

    const parsed = healthStatusSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('maps a degraded snapshot to degraded', () => {
    const snapshot = baseSnapshot({ readiness: 'degraded' });
    const result = toHealthStatus(snapshot);

    expect(result.status).toBe('degraded');
    expect(result.readiness).toBe('degraded');

    const parsed = healthStatusSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('dependencies is DependencyStatus[] (not the raw snapshot.dependencies object)', () => {
    const snapshot = baseSnapshot();
    const result = toHealthStatus(snapshot);

    // contract.dependencies should be an array, never the raw snapshot.dependencies object
    expect(Array.isArray(result.dependencies)).toBe(true);
    expect(result.dependencies).toHaveLength(4);
    // Each element must conform to DependencyStatus shape
    for (const dep of result.dependencies) {
      expect(dep).toHaveProperty('name');
      expect(dep).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(dep.status);
    }
  });

  it('deployment has contract shape { profile, preset? } not the raw snapshot.deployment', () => {
    const snapshot = baseSnapshot();
    const result = toHealthStatus(snapshot);

    // contract.deployment must have profile (string) and optionally preset
    expect(result.deployment).toBeDefined();
    expect(typeof result.deployment!.profile).toBe('string');
    expect(result.deployment!.profile).toBe('team-monolith');
    // Must NOT have raw snapshot fields like capabilities, routeSurface, etc.
    expect(result.deployment).not.toHaveProperty('capabilities');
    expect(result.deployment).not.toHaveProperty('deploymentProfile');
  });

  it('produces a strict HealthStatus shape with no extra keys', () => {
    const snapshot = baseSnapshot();
    const result = toHealthStatus(snapshot);

    const allowedKeys = [
      'status',
      'timestamp',
      'startedAt',
      'uptime',
      'version',
      'readiness',
      'liveness',
      'dependencies',
      'deployment',
    ];
    const resultKeys = Object.keys(result);
    for (const key of resultKeys) {
      expect(allowedKeys).toContain(key);
    }
  });

  it('includes deployment information', () => {
    const result = toHealthStatus(baseSnapshot());

    expect(result.deployment).toEqual({
      profile: 'team-monolith',
      preset: 'monolith',
    });
  });
});

describe('dependency mapping', () => {
  it('maps healthy dependencies correctly', () => {
    const result = toHealthStatus(baseSnapshot());

    expect(result.dependencies).toHaveLength(4);

    const db = result.dependencies.find((d) => d.name === 'database')!;
    expect(db.status).toBe('healthy');
    expect(db.message).toBe('postgres');

    const queue = result.dependencies.find((d) => d.name === 'queue-worker')!;
    expect(queue.status).toBe('healthy');

    const outbox = result.dependencies.find((d) => d.name === 'outbox-worker')!;
    expect(outbox.status).toBe('healthy');

    const graph = result.dependencies.find((d) => d.name === 'graph-query')!;
    expect(graph.status).toBe('healthy');
  });

  it('maps degraded worker states', () => {
    const snapshot = baseSnapshot({
      dependencies: {
        ...baseSnapshot().dependencies,
        queueWorker: 'degraded',
        outboxWorker: 'degraded',
      },
    });
    const result = toHealthStatus(snapshot);

    const queue = result.dependencies.find((d) => d.name === 'queue-worker')!;
    expect(queue.status).toBe('degraded');

    const outbox = result.dependencies.find((d) => d.name === 'outbox-worker')!;
    expect(outbox.status).toBe('degraded');
  });

  it('maps remote and not-configured workers to unknown', () => {
    const snapshot = baseSnapshot({
      dependencies: {
        ...baseSnapshot().dependencies,
        queueWorker: 'remote',
        outboxWorker: 'not-configured',
      },
    });
    const result = toHealthStatus(snapshot);

    const queue = result.dependencies.find((d) => d.name === 'queue-worker')!;
    expect(queue.status).toBe('unknown');

    const outbox = result.dependencies.find((d) => d.name === 'outbox-worker')!;
    expect(outbox.status).toBe('unknown');
  });

  it('maps graph-query fallback to degraded and failed to unhealthy', () => {
    const fallbackSnapshot = baseSnapshot({
      dependencies: {
        ...baseSnapshot().dependencies,
        graphQuery: 'fallback',
      },
    });
    const fallbackResult = toHealthStatus(fallbackSnapshot);
    expect(fallbackResult.dependencies.find((d) => d.name === 'graph-query')!.status).toBe(
      'degraded',
    );

    const failedSnapshot = baseSnapshot({
      dependencies: {
        ...baseSnapshot().dependencies,
        graphQuery: 'failed',
      },
    });
    const failedResult = toHealthStatus(failedSnapshot);
    expect(failedResult.dependencies.find((d) => d.name === 'graph-query')!.status).toBe(
      'unhealthy',
    );
  });

  it('maps json-store database to unknown', () => {
    const snapshot = baseSnapshot({
      dependencies: {
        ...baseSnapshot().dependencies,
        database: 'json-store',
      },
    });
    const result = toHealthStatus(snapshot);

    const db = result.dependencies.find((d) => d.name === 'database')!;
    expect(db.status).toBe('unknown');
    expect(db.message).toBe('json-store');
  });

  it('maps disabled graph-query to unknown', () => {
    const snapshot = baseSnapshot({
      dependencies: {
        ...baseSnapshot().dependencies,
        graphQuery: 'disabled',
      },
    });
    const result = toHealthStatus(snapshot);

    const graph = result.dependencies.find((d) => d.name === 'graph-query')!;
    expect(graph.status).toBe('unknown');
  });
});

describe('livenessTimestamp', () => {
  it('returns a valid ISO datetime string', () => {
    const ts = livenessTimestamp();
    const parsed = new Date(ts);
    expect(parsed.toISOString()).toBe(ts);
  });
});
