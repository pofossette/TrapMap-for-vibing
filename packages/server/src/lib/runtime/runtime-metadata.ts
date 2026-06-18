import type { AsyncWorkerDependencyState } from '@trapmap/contracts';
import type { ServerConfig } from '@trapmap/server/config.js';
import type { GraphQueryRuntimeState } from '@trapmap/server/lib/graph-query/backend.js';
import type { OutboxStatusSnapshot } from '@trapmap/server/lib/lifecycle/outbox.js';
import type { TaskQueueStatusSnapshot } from '@trapmap/server/lib/queue/task-queue.js';
import type { ResolvedRuntimeDeployment } from './deployment-profile.js';
import type { RouteFamilyDescriptor } from './route-surface.js';
import { buildRouteSurfaceSummary } from './route-surface.js';
import type { RuntimeMode } from './runtime-contract.js';
import type { ServiceTopologySnapshot } from './service-topology.js';
import { buildServiceTopologySnapshot } from './service-topology.js';
import type { ServiceUnit, ServiceUnitProfile } from './service-unit.js';
export { resolveAsyncWorkerState } from './runtime-ownership.js';

export interface RuntimeDependencyState {
  database: 'postgres' | 'json-store';
  queueWorker: AsyncWorkerDependencyState;
  outboxWorker: AsyncWorkerDependencyState;
  graphQuery: 'disabled' | 'healthy' | 'fallback' | 'failed';
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  deployment: {
    profile: ResolvedRuntimeDeployment['deploymentProfile'];
    preset: ResolvedRuntimeDeployment['preset'];
    routeSurface: ResolvedRuntimeDeployment['capabilities']['routeSurface'];
    routeFamilies: RouteFamilyDescriptor[];
    asyncOwnershipExpectation: ResolvedRuntimeDeployment['capabilities']['asyncOwnershipExpectation'];
    storagePosture: ResolvedRuntimeDeployment['capabilities']['storagePosture'];
    authTeamExpectation: ResolvedRuntimeDeployment['capabilities']['authTeamExpectation'];
    publicGatewayRouteCount: number;
    internalRouteCount: number;
  };
  ownership: {
    queue: {
      ownsAny: boolean;
      ownsCandidateTaskWork: boolean;
      ownsSharedJobTaskWork: boolean;
    };
    outbox: {
      ownsAny: boolean;
      ownsOutboxWork: boolean;
    };
  };
  topology: ServiceTopologySnapshot;
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
  deployment: ResolvedRuntimeDeployment;
  serviceUnit: {
    name: ServiceUnit;
    ownership: ServiceUnitProfile;
  };
  topology: ServiceTopologySnapshot;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  uptimeSeconds: number;
  async?: {
    queue: Pick<
      TaskQueueStatusSnapshot,
      'pending' | 'running' | 'dead' | 'staleRunning' | 'reclaimCount'
    >;
    outbox: Pick<
      OutboxStatusSnapshot,
      'pending' | 'processing' | 'failed' | 'staleProcessing' | 'reclaimCount'
    >;
  };
}

interface BuildRuntimeStatusSnapshotOptions {
  config: ServerConfig;
  graphQuery: GraphQueryRuntimeState;
  database: 'postgres' | 'json-store';
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  runtimeDeployment: ResolvedRuntimeDeployment;
  serviceUnitProfile: ServiceUnitProfile;
  queueWorkerState: AsyncWorkerDependencyState;
  outboxWorkerState: AsyncWorkerDependencyState;
  queueSnapshot?: Pick<
    TaskQueueStatusSnapshot,
    'pending' | 'running' | 'dead' | 'staleRunning' | 'reclaimCount'
  >;
  outboxSnapshot?: Pick<
    OutboxStatusSnapshot,
    'pending' | 'processing' | 'failed' | 'staleProcessing' | 'reclaimCount'
  >;
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
  const queueWorker = options.queueWorkerState;
  const outboxWorker = options.outboxWorkerState;
  const routeSurfaceSummary = buildRouteSurfaceSummary(options.runtimeDeployment);
  const topology = buildServiceTopologySnapshot({
    deployment: options.runtimeDeployment,
    routeFamilies: routeSurfaceSummary.routeFamilies,
    runtimeMode: options.runtimeMode,
    serviceUnit: options.serviceUnit,
    serviceUnitProfile: options.serviceUnitProfile,
  });

  const readiness: RuntimeStatusSnapshot['readiness'] =
    graphDependency === 'failed' || queueWorker === 'degraded' || outboxWorker === 'degraded'
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
      runtimeMode: options.runtimeMode,
      serviceUnit: options.serviceUnit,
      deployment: {
        profile: options.runtimeDeployment.deploymentProfile,
        preset: options.runtimeDeployment.preset,
        routeSurface: options.runtimeDeployment.capabilities.routeSurface,
        routeFamilies: routeSurfaceSummary.routeFamilies,
        asyncOwnershipExpectation: options.runtimeDeployment.capabilities.asyncOwnershipExpectation,
        storagePosture: options.runtimeDeployment.capabilities.storagePosture,
        authTeamExpectation: options.runtimeDeployment.capabilities.authTeamExpectation,
        publicGatewayRouteCount: routeSurfaceSummary.publicGatewayRouteCount,
        internalRouteCount: routeSurfaceSummary.internalRouteCount,
      },
      ownership: {
        queue: {
          ownsAny:
            options.serviceUnitProfile.ownsCandidateTaskWork ||
            options.serviceUnitProfile.ownsSharedJobTaskWork,
          ownsCandidateTaskWork: options.serviceUnitProfile.ownsCandidateTaskWork,
          ownsSharedJobTaskWork: options.serviceUnitProfile.ownsSharedJobTaskWork,
        },
        outbox: {
          ownsAny: options.serviceUnitProfile.ownsOutboxWork,
          ownsOutboxWork: options.serviceUnitProfile.ownsOutboxWork,
        },
      },
      topology,
    },
    graphQuery: options.graphQuery,
    deployment: options.runtimeDeployment,
    serviceUnit: {
      name: options.serviceUnit,
      ownership: options.serviceUnitProfile,
    },
    topology,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    uptimeSeconds: Math.round(process.uptime()),
    ...(options.queueSnapshot && options.outboxSnapshot
      ? {
          async: {
            queue: {
              pending: options.queueSnapshot.pending,
              running: options.queueSnapshot.running,
              dead: options.queueSnapshot.dead,
              staleRunning: options.queueSnapshot.staleRunning,
              reclaimCount: options.queueSnapshot.reclaimCount,
            },
            outbox: {
              pending: options.outboxSnapshot.pending,
              processing: options.outboxSnapshot.processing,
              failed: options.outboxSnapshot.failed,
              staleProcessing: options.outboxSnapshot.staleProcessing,
              reclaimCount: options.outboxSnapshot.reclaimCount,
            },
          },
        }
      : {}),
  };
}
