import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { ServerConfig } from '@trapmap/server/config.js';
import { isAppError, toErrorMetadata } from '@trapmap/server/lib/errors.js';
import { livenessTimestamp, toHealthStatus } from './health-adapter.js';
import { getOrCreateRequestContext } from './request-context.js';
import type { RouteFamilyDescriptor } from './route-surface.js';
import { snapshotRuntimeWorker } from './runtime-contract.js';
import { buildRuntimeStatusSnapshot, resolveAsyncWorkerState } from './runtime-metadata.js';
import { buildServiceTopologySnapshot } from './service-topology.js';
import { getServiceUnitProfile } from './service-unit.js';

interface RouteSurfaceSummary {
  routeSurface: 'minimal-agent' | 'gateway-core' | 'worker-status';
  routeFamilies: RouteFamilyDescriptor[];
  publicGatewayRouteCount: number;
  internalRouteCount: number;
}

async function buildRuntimeAsyncSnapshot(app: FastifyInstance) {
  if (!app.skillShareer.pool) {
    return {};
  }
  const transport = app.skillShareer.asyncTransport;
  if (!transport) {
    throw new Error('Postgres runtime requires skillShareer.asyncTransport for runtime status');
  }
  const [queueSnapshot, outboxSnapshot] = await Promise.all([
    transport.task.getStatusSnapshot(),
    transport.events.getStatusSnapshot(),
  ]);
  return { queueSnapshot, outboxSnapshot };
}

async function buildSharedRuntimeSnapshot(app: FastifyInstance, config: ServerConfig) {
  const graphQuery =
    app.skillShareer.graphQueryBackend?.getRuntimeState?.() ?? app.skillShareer.graphQuery;
  const queueWorker = snapshotRuntimeWorker(app.taskWorker);
  const outboxWorker = snapshotRuntimeWorker(app.outboxWorker);
  const database = app.skillShareer.pool ? ('postgres' as const) : ('json-store' as const);
  const runtimeMode = app.skillShareer.runtimeMode;
  const serviceUnit = app.skillShareer.serviceUnit;
  const runtimeDeployment = app.skillShareer.runtimeDeployment;
  const serviceUnitProfile = getServiceUnitProfile(serviceUnit, runtimeMode);
  const { queueSnapshot, outboxSnapshot } = await buildRuntimeAsyncSnapshot(app);

  return buildRuntimeStatusSnapshot({
    config,
    graphQuery,
    database,
    runtimeMode,
    serviceUnit,
    runtimeDeployment,
    serviceUnitProfile,
    queueWorkerState: resolveAsyncWorkerState({
      database,
      runtimeMode,
      workerKind: 'queue',
      owner: queueWorker.owner,
      running: queueWorker.running,
    }),
    outboxWorkerState: resolveAsyncWorkerState({
      database,
      runtimeMode,
      workerKind: 'outbox',
      owner: outboxWorker.owner,
      running: outboxWorker.running,
    }),
    ...(queueSnapshot ? { queueSnapshot } : {}),
    ...(outboxSnapshot ? { outboxSnapshot } : {}),
  });
}

export function registerRuntimeRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  routeSurfaceSummary: RouteSurfaceSummary,
  documentedRoutes: readonly string[],
) {
  app.get('/health', async () => {
    const runtime = await buildSharedRuntimeSnapshot(app, config);
    const contract = toHealthStatus(runtime);

    return {
      // HealthStatus contract fields — no clobbering
      status: contract.status,
      readiness: contract.readiness,
      liveness: contract.liveness,
      dependencies: contract.dependencies,
      deployment: contract.deployment,
      timestamp: contract.timestamp,
      startedAt: contract.startedAt,
      uptime: contract.uptime,
      // Raw backward-compatible snapshot data nested under a dedicated key
      snapshot: {
        product: runtime.product,
        packages: runtime.packages,
        requestContext: runtime.requestContext,
        graphQuery: runtime.graphQuery,
        serviceUnit: runtime.serviceUnit,
        topology: runtime.topology,
        memory: runtime.memory,
        uptimeSeconds: runtime.uptimeSeconds,
        async: runtime.async,
      },
    };
  });

  app.get('/ready', async (_request, reply) => {
    const runtime = await buildSharedRuntimeSnapshot(app, config);
    const contract = toHealthStatus(runtime);

    const responseBody = {
      ok: runtime.readiness !== 'not-ready',
      // HealthStatus contract fields — no clobbering
      status: contract.status,
      readiness: contract.readiness,
      liveness: contract.liveness,
      dependencies: contract.dependencies,
      deployment: contract.deployment,
      timestamp: contract.timestamp,
      startedAt: contract.startedAt,
      uptime: contract.uptime,
      // Raw backward-compatible snapshot data nested under a dedicated key
      snapshot: {
        product: runtime.product,
        packages: runtime.packages,
        requestContext: runtime.requestContext,
        graphQuery: runtime.graphQuery,
        serviceUnit: runtime.serviceUnit,
        topology: runtime.topology,
        memory: runtime.memory,
        uptimeSeconds: runtime.uptimeSeconds,
        async: runtime.async,
      },
    };

    if (runtime.readiness === 'not-ready') {
      return reply.status(503).send(responseBody);
    }

    return responseBody;
  });

  app.get('/live', async () => ({
    status: 'alive',
    timestamp: livenessTimestamp(),
  }));

  app.get('/meta/routes', async () => ({
    routeSurface: routeSurfaceSummary.routeSurface,
    routeFamilies: routeSurfaceSummary.routeFamilies,
    publicGatewayRouteCount: routeSurfaceSummary.publicGatewayRouteCount,
    internalRouteCount: routeSurfaceSummary.internalRouteCount,
    topology: buildServiceTopologySnapshot({
      deployment: app.skillShareer.runtimeDeployment,
      routeFamilies: routeSurfaceSummary.routeFamilies,
      runtimeMode: app.skillShareer.runtimeMode,
      serviceUnit: app.skillShareer.serviceUnit,
      serviceUnitProfile: getServiceUnitProfile(
        app.skillShareer.serviceUnit,
        app.skillShareer.runtimeMode,
      ),
    }),
    documentedRoutes,
  }));
}

function logHandledError(
  app: FastifyInstance,
  request: FastifyRequest,
  message: string,
  payload: Record<string, unknown>,
) {
  const requestContext = request.requestContext!;
  app.log.warn(
    {
      requestId: requestContext.requestId,
      traceId: requestContext.traceId,
      method: requestContext.method,
      route: requestContext.route,
      ...payload,
    },
    message,
  );
}

export function handleRuntimeError(
  app: FastifyInstance,
  config: ServerConfig,
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const requestContext = request.requestContext ?? getOrCreateRequestContext(request, config);
  request.requestContext = requestContext;

  if (isAppError(error)) {
    logHandledError(app, request, 'Handled application error', {
      error: toErrorMetadata(error),
    });
    return reply.status(error.statusCode).send({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof ZodError) {
    logHandledError(app, request, 'Validation error', {
      issueCount: error.issues.length,
    });
    return reply.status(400).send({
      code: 'validation_error',
      message: error.issues.map((issue) => issue.message).join('; '),
      issues: error.issues,
    });
  }

  app.log.error(
    {
      requestId: requestContext.requestId,
      traceId: requestContext.traceId,
      method: requestContext.method,
      route: requestContext.route,
      error: toErrorMetadata(error),
    },
    'Unhandled server error',
  );
  return reply.status(500).send({
    code: 'internal_error',
    message: 'Unexpected server error',
  });
}
