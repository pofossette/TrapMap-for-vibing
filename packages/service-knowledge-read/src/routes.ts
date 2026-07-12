import { InvocationError, type KnowledgeReadPort } from '@trapmap/backend-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function translateInvocationError(error: unknown): {
  status: number;
  body: { error: string; message: string };
} {
  if (error instanceof InvocationError) {
    const statusMap: Record<string, number> = {
      validation: 400,
      forbidden: 403,
      'not-found': 404,
      conflict: 409,
      unavailable: 503,
      timeout: 504,
      internal: 500,
    };
    return {
      status: statusMap[error.kind] ?? 500,
      body: { error: error.kind, message: error.message },
    };
  }

  return {
    status: 500,
    body: { error: 'internal', message: error instanceof Error ? error.message : 'Unknown error' },
  };
}

export function registerKnowledgeReadRoutes(app: FastifyInstance, module: KnowledgeReadPort): void {
  app.get('/internal/knowledge/:entryId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { entryId } = req.params as { entryId: string };
      const entry = await module.getById(entryId);
      if (!entry) {
        return reply.status(404).send({
          error: 'not-found',
          message: 'Knowledge entry not found',
        });
      }
      return reply.status(200).send(entry);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/knowledge/mine', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId, teamId } = req.query as { userId?: string; teamId?: string };
      if (!userId) {
        return reply.status(400).send({
          error: 'validation',
          message: 'userId query parameter is required',
        });
      }
      const entries = await module.listMine(userId, teamId);
      return reply.status(200).send(entries);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/retrieval/search', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { query, teamId, limit } = (req.body ?? {}) as {
        query?: string;
        teamId?: string;
        limit?: number;
      };
      if (!query) {
        return reply.status(400).send({
          error: 'validation',
          message: 'query is required in request body',
        });
      }
      const results = await module.search({
        query,
        ...(teamId !== undefined ? { teamId } : {}),
        ...(limit !== undefined ? { limit } : {}),
      });
      return reply.status(200).send(results);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', service: 'knowledge-read' });
  });

  app.get(
    '/internal/knowledge-read/projection-status',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const status = await module.getProjectionStatus();
        return reply.status(200).send(status);
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post(
    '/internal/knowledge-read/projection-rebuild',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      if (!module.rebuildProjection) {
        return reply.status(501).send({
          error: 'not-implemented',
          message: 'Projection rebuild is not configured for this knowledge-read host',
        });
      }
      try {
        const status = await module.rebuildProjection();
        return reply.status(202).send(status);
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );
}
