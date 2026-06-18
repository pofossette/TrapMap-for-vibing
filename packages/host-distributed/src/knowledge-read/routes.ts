/**
 * Internal HTTP routes for the knowledge-read service.
 *
 * Exposes read-only knowledge queries and retrieval search endpoints.
 * All routes are prefixed with /internal since the gateway owns
 * the public API surface.
 */

import { InvocationError } from '@trapmap/backend-core';
import type { KnowledgeReadPort } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Error kind -> HTTP status mapping
// ---------------------------------------------------------------------------

const ERROR_STATUS: Record<string, number> = {
  validation: 400,
  'not-found': 404,
  conflict: 409,
  forbidden: 403,
  timeout: 504,
  unavailable: 503,
  internal: 500,
};

function errorToStatus(err: unknown): number {
  if (err instanceof InvocationError) {
    return ERROR_STATUS[err.kind] ?? 500;
  }
  return 500;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerRoutes(app: FastifyInstance, module: KnowledgeReadPort): void {
  // GET /internal/knowledge/:entryId
  app.get<{
    Params: { entryId: string };
  }>('/internal/knowledge/:entryId', async (request, reply) => {
    try {
      const entry = await module.getById(request.params.entryId);
      if (!entry) {
        return reply.status(404).send({ error: 'not-found', message: 'Knowledge entry not found' });
      }
      return reply.send(entry);
    } catch (err) {
      return reply.status(errorToStatus(err)).send({
        error: err instanceof InvocationError ? err.kind : 'internal',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // GET /internal/knowledge/mine
  app.get<{
    Querystring: { userId: string; teamId?: string };
  }>('/internal/knowledge/mine', async (request, reply) => {
    try {
      const { userId, teamId } = request.query;
      if (!userId) {
        return reply
          .status(400)
          .send({ error: 'validation', message: 'userId query parameter is required' });
      }
      const entries = await module.listMine(userId, teamId);
      return reply.send(entries);
    } catch (err) {
      return reply.status(errorToStatus(err)).send({
        error: err instanceof InvocationError ? err.kind : 'internal',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // POST /internal/retrieval/search
  app.post<{
    Body: { query: string; teamId?: string; limit?: number };
  }>('/internal/retrieval/search', async (request, reply) => {
    try {
      const { query, teamId, limit } = request.body;
      if (!query) {
        return reply
          .status(400)
          .send({ error: 'validation', message: 'query is required in request body' });
      }
      const results = await module.search({
        query,
        ...(teamId !== undefined ? { teamId } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
      return reply.send(results);
    } catch (err) {
      return reply.status(errorToStatus(err)).send({
        error: err instanceof InvocationError ? err.kind : 'internal',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // GET /internal/health
  app.get('/internal/health', async (_request, reply) => {
    return reply.send({ status: 'ok', service: 'knowledge-read' });
  });
}
