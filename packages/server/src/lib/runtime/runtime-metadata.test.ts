import { describe, expect, it } from 'vitest';

import type { ServerConfig } from '@trapmap/server/config.js';
import { buildRuntimeStatusSnapshot } from './runtime-metadata.js';

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
    });
  });

  it('reports not-ready when a configured queue worker is stopped', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
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
  });
});
