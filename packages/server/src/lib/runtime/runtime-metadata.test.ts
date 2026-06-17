import { describe, expect, it } from 'vitest';

import type { ServerConfig } from '@trapmap/server/config.js';
import { buildRuntimeStatusSnapshot, resolveAsyncWorkerState } from './runtime-metadata.js';
import { getServiceUnitProfile } from './service-unit.js';

const baseConfig = {
  runtime: {
    requestIdHeader: 'x-request-id',
    traceHeaderName: 'traceparent',
  },
} as ServerConfig;

describe('buildRuntimeStatusSnapshot', () => {
  it('reports ready when graph is disabled and queue worker is not configured', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'json-store',
      runtimeMode: 'api',
      serviceUnit: 'full-platform',
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
    });
  });

  it('reports not-ready when a configured queue worker is stopped', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'full-platform',
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
  });

  it('surfaces service-unit ownership for candidate-ingestion combined runtime', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      runtimeMode: 'combined',
      serviceUnit: 'candidate-ingestion',
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
