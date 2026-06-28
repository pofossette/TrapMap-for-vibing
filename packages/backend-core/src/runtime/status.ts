import type { ResolvedRuntimeDeployment } from './capability-model.js';
import type { RuntimeMode, ServiceUnit, ServiceUnitProfile } from './capability-model.js';
import type { RouteFamilyDescriptor } from './route-surface.js';
import { buildRouteSurfaceSummary } from './route-surface.js';
import { buildServiceTopologySnapshot } from './topology.js';
import type { ServiceTopologySnapshot } from './topology.js';

export interface RuntimeStatusConfig {
  runtime: {
    requestIdHeader: string;
    traceHeaderName: string;
  };
}

export interface RuntimeDependencyState {
  database: 'postgres' | 'json-store';
  queueWorker: import('./capability-model.js').AsyncWorkerDependencyState;
  outboxWorker: import('./capability-model.js').AsyncWorkerDependencyState;
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
  graphQuery: {
    mode: 'disabled' | 'enabled-fallback' | 'enabled-primary';
    backendKind: string;
    failOpen: boolean;
    detail?: string;
  };
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
    queue: {
      pending: number;
      running: number;
      dead: number;
      staleRunning: number;
      reclaimCount: number;
    };
    outbox: {
      pending: number;
      processing: number;
      failed: number;
      staleProcessing: number;
      reclaimCount: number;
    };
  };
}

interface BuildRuntimeStatusSnapshotOptions {
  config: RuntimeStatusConfig;
  graphQuery: RuntimeStatusSnapshot['graphQuery'];
  database: 'postgres' | 'json-store';
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  runtimeDeployment: ResolvedRuntimeDeployment;
  serviceUnitProfile: ServiceUnitProfile;
  queueWorkerState: import('./capability-model.js').AsyncWorkerDependencyState;
  outboxWorkerState: import('./capability-model.js').AsyncWorkerDependencyState;
  queueSnapshot?: RuntimeStatusSnapshot['async'] extends infer Async
    ? Async extends { queue: infer Queue }
      ? Queue
      : never
    : never;
  outboxSnapshot?: RuntimeStatusSnapshot['async'] extends infer Async
    ? Async extends { outbox: infer Outbox }
      ? Outbox
      : never
    : never;
}

function resolveGraphDependencyState(
  graphQuery: RuntimeStatusSnapshot['graphQuery'],
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
  const routeSurfaceSummary = buildRouteSurfaceSummary(options.runtimeDeployment);
  const topology = buildServiceTopologySnapshot({
    deployment: options.runtimeDeployment,
    routeFamilies: routeSurfaceSummary.routeFamilies,
    runtimeMode: options.runtimeMode,
    serviceUnit: options.serviceUnit,
    serviceUnitProfile: options.serviceUnitProfile,
  });

  const readiness: RuntimeStatusSnapshot['readiness'] =
    graphDependency === 'failed' ||
    options.queueWorkerState === 'degraded' ||
    options.outboxWorkerState === 'degraded'
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
      queueWorker: options.queueWorkerState,
      outboxWorker: options.outboxWorkerState,
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
            queue: options.queueSnapshot,
            outbox: options.outboxSnapshot,
          },
        }
      : {}),
  };
}
