import type { ServerConfig } from '@trapmap/server/config.js';
import type { GraphQueryRuntimeState } from '@trapmap/server/lib/graph-query/backend.js';

export interface RuntimeDependencyState {
  database: 'postgres' | 'json-store';
  queueWorker: 'running' | 'stopped' | 'not-configured';
  outboxWorker: 'running' | 'stopped' | 'not-configured';
  graphQuery: 'disabled' | 'healthy' | 'fallback' | 'failed';
}

export interface RuntimeStatusSnapshot {
  liveness: 'alive';
  readiness: 'ready' | 'degraded' | 'not-ready';
  product: 'trapmap';
  packages: ['cli', 'server', 'contracts'];
  requestContext: {
    requestIdHeader: string;
    traceHeader: string | null;
  };
  dependencies: RuntimeDependencyState;
  graphQuery: GraphQueryRuntimeState;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  uptimeSeconds: number;
}

interface BuildRuntimeStatusSnapshotOptions {
  config: ServerConfig;
  graphQuery: GraphQueryRuntimeState;
  database: 'postgres' | 'json-store';
  queueWorkerRunning: boolean;
  queueWorkerConfigured: boolean;
  outboxWorkerRunning: boolean;
  outboxWorkerConfigured: boolean;
}

function resolveGraphDependencyState(
  graphQuery: GraphQueryRuntimeState,
): RuntimeDependencyState['graphQuery'] {
  if (graphQuery.mode === 'disabled') {
    return 'disabled';
  }
  if (graphQuery.mode === 'enabled-fallback') {
    return 'fallback';
  }

  return graphQuery.detail ? 'failed' : 'healthy';
}

export function buildRuntimeStatusSnapshot(
  options: BuildRuntimeStatusSnapshotOptions,
): RuntimeStatusSnapshot {
  const mem = process.memoryUsage();
  const graphDependency = resolveGraphDependencyState(options.graphQuery);
  const queueWorker = options.queueWorkerConfigured
    ? options.queueWorkerRunning
      ? 'running'
      : 'stopped'
    : 'not-configured';
  const outboxWorker = options.outboxWorkerConfigured
    ? options.outboxWorkerRunning
      ? 'running'
      : 'stopped'
    : 'not-configured';

  const readiness: RuntimeStatusSnapshot['readiness'] =
    graphDependency === 'failed' || queueWorker === 'stopped' || outboxWorker === 'stopped'
      ? 'not-ready'
      : 'ready';
  const normalizedReadiness =
    graphDependency === 'fallback' && readiness === 'ready' ? 'degraded' : readiness;

  return {
    liveness: 'alive',
    readiness: normalizedReadiness,
    product: 'trapmap',
    packages: ['cli', 'server', 'contracts'],
    requestContext: {
      requestIdHeader: options.config.runtime.requestIdHeader,
      traceHeader: options.config.runtime.traceHeaderName,
    },
    dependencies: {
      database: options.database,
      queueWorker,
      outboxWorker,
      graphQuery: graphDependency,
    },
    graphQuery: options.graphQuery,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    uptimeSeconds: Math.round(process.uptime()),
  };
}
