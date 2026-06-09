import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import type { ServerConfig } from '@trapmap/server/config.js';
import { AppError, isAppError, toErrorMetadata } from '@trapmap/server/lib/errors.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { getOrCreateRequestContext } from './request-context.js';
import { buildRuntimeStatusSnapshot } from './runtime-metadata.js';

export function registerRuntimeRoutes(app: FastifyInstance, config: ServerConfig, documentedRoutes: readonly string[]) {
  app.get('/health', async () => {
    const graphQuery =
      app.skillShareer.graphQueryBackend?.getRuntimeState?.() ?? app.skillShareer.graphQuery;
    const queueWorker = (app as any).taskWorker;
    const outboxWorker = (app as any).outboxWorker;
    const store = app.skillShareer.store;
    const database =
      store instanceof PostgresStore ? ('postgres' as const) : ('json-store' as const);
    const runtime = buildRuntimeStatusSnapshot({
      config,
      graphQuery,
      database,
      queueWorkerConfigured: store instanceof PostgresStore,
      queueWorkerRunning: queueWorker?.isRunning?.() ?? false,
      outboxWorkerConfigured: store instanceof PostgresStore,
      outboxWorkerRunning: outboxWorker?.isRunning?.() ?? false,
    });

    return {
      status: 'ok',
      ...runtime,
    };
  });

  app.get('/ready', async (_request, reply) => {
    const taskWorker = (app as any).taskWorker;
    const outboxWorker = (app as any).outboxWorker;
    const store = app.skillShareer.store;
    const database =
      store instanceof PostgresStore ? ('postgres' as const) : ('json-store' as const);
    const graphQuery =
      app.skillShareer.graphQueryBackend?.getRuntimeState?.() ?? app.skillShareer.graphQuery;
    const runtime = buildRuntimeStatusSnapshot({
      config,
      graphQuery,
      database,
      queueWorkerConfigured: store instanceof PostgresStore,
      queueWorkerRunning: taskWorker?.isRunning?.() ?? false,
      outboxWorkerConfigured: store instanceof PostgresStore,
      outboxWorkerRunning: outboxWorker?.isRunning?.() ?? false,
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
