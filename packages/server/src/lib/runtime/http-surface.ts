import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { ServerConfig } from '@trapmap/server/config.js';
import { isAppError, toErrorMetadata } from '@trapmap/server/lib/errors.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { getServiceUnitProfile } from './service-unit.js';
import { getOrCreateRequestContext } from './request-context.js';
import { snapshotRuntimeWorker } from './runtime-contract.js';
import { buildRuntimeStatusSnapshot, resolveAsyncWorkerState } from './runtime-metadata.js';

async function buildRuntimeAsyncSnapshot(app: FastifyInstance) {
  const store = app.skillShareer.store;
  if (!(store instanceof PostgresStore)) {
    return {};
  }
  const transport = app.skillShareer.asyncTransport;
  if (!transport) {
    throw new Error('Postgres runtime requires skillShareer.asyncTransport for runtime status');
  }
  const [queueSnapshot, outboxSnapshot] = await Promise.all([
    transport.queue.getStatusSnapshot(),
    transport.events.getStatusSnapshot(),
  ]);
  return { queueSnapshot, outboxSnapshot };
}

export function registerRuntimeRoutes(
  app: FastifyInstance,
  config: ServerConfig,
  documentedRoutes: readonly string[],
) {
  app.get('/health', async () => {
    const graphQuery =
      app.skillShareer.graphQueryBackend?.getRuntimeState?.() ?? app.skillShareer.graphQuery;
    const queueWorker = snapshotRuntimeWorker(app.taskWorker);
    const outboxWorker = snapshotRuntimeWorker(app.outboxWorker);
    const store = app.skillShareer.store;
    const database =
      store instanceof PostgresStore ? ('postgres' as const) : ('json-store' as const);
    const runtimeMode = app.skillShareer.runtimeMode;
    const serviceUnit = app.skillShareer.serviceUnit;
    const serviceUnitProfile = getServiceUnitProfile(serviceUnit, runtimeMode);
    const { queueSnapshot, outboxSnapshot } = await buildRuntimeAsyncSnapshot(app);
    const runtime = buildRuntimeStatusSnapshot({
      config,
      graphQuery,
      database,
      runtimeMode,
      serviceUnit,
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

    return {
      status: 'ok',
      ...runtime,
    };
  });

  app.get('/ready', async (_request, reply) => {
    const taskWorker = snapshotRuntimeWorker(app.taskWorker);
    const outboxWorker = snapshotRuntimeWorker(app.outboxWorker);
    const store = app.skillShareer.store;
    const database =
      store instanceof PostgresStore ? ('postgres' as const) : ('json-store' as const);
    const runtimeMode = app.skillShareer.runtimeMode;
    const serviceUnit = app.skillShareer.serviceUnit;
    const serviceUnitProfile = getServiceUnitProfile(serviceUnit, runtimeMode);
    const graphQuery =
      app.skillShareer.graphQueryBackend?.getRuntimeState?.() ?? app.skillShareer.graphQuery;
    const { queueSnapshot, outboxSnapshot } = await buildRuntimeAsyncSnapshot(app);
    const runtime = buildRuntimeStatusSnapshot({
      config,
      graphQuery,
      database,
      runtimeMode,
      serviceUnit,
      serviceUnitProfile,
      queueWorkerState: resolveAsyncWorkerState({
        database,
        runtimeMode,
        workerKind: 'queue',
        owner: taskWorker.owner,
        running: taskWorker.running,
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

    const responseBody = {
      ok: runtime.readiness !== 'not-ready',
      ...runtime,
    };

    if (runtime.readiness === 'not-ready') {
      return reply.status(503).send(responseBody);
    }

    return responseBody;
  });

  app.get('/meta/routes', async () => ({
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
