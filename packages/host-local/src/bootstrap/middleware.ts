/**
 * Request logging middleware.
 *
 * Logs incoming requests and their completion time.
 * Framework-agnostic interface that wraps Fastify hooks.
 */

import type { FastifyInstance } from 'fastify';

/**
 * Register request logging hooks on the Fastify instance.
 */
export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const durationMs = request.startTime ? Date.now() - request.startTime : 0;
    app.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs,
      },
      'request completed',
    );
  });
}

/**
 * Register error handling middleware.
 *
 * Catches unhandled errors and returns a structured error response.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((rawError, _request, reply) => {
    const error = rawError instanceof Error ? rawError : new Error(String(rawError));
    const statusCode = (rawError as { statusCode?: number }).statusCode ?? 500;
    const message = statusCode >= 500 ? 'Internal server error' : error.message;

    app.log.error({ error: error.message, statusCode, stack: error.stack }, 'unhandled error');

    return reply.status(statusCode).send({
      error: message,
      kind: statusCode >= 500 ? 'internal' : 'validation',
    });
  });
}

/**
 * Register CORS headers for the Web panel.
 *
 * Allows the Web panel (served on a different origin) to make
 * API requests to the gateway.
 */
export function registerCors(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });
}
