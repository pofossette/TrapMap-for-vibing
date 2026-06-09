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
      queueWorkerConfigured: false,
      queueWorkerRunning: false,
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
      graphQuery: 'disabled',
    });
  });

  it('reports not-ready when a configured queue worker is stopped', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      queueWorkerConfigured: true,
      queueWorkerRunning: false,
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('not-ready');
    expect(snapshot.dependencies.queueWorker).toBe('stopped');
  });

  it('reports degraded when graph backend is in fallback mode', () => {
    const snapshot = buildRuntimeStatusSnapshot({
      config: baseConfig,
      database: 'postgres',
      queueWorkerConfigured: true,
      queueWorkerRunning: true,
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
      queueWorkerConfigured: true,
      queueWorkerRunning: true,
      graphQuery: {
        mode: 'enabled-primary',
        backendKind: 'neo4j',
        failOpen: true,
      },
    });

    expect(snapshot.readiness).toBe('ready');
    expect(snapshot.dependencies.graphQuery).toBe('healthy');
  });
});
