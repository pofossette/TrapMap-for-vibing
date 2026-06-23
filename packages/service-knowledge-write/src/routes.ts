import type { KnowledgeWritePort } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function translateInvocationError(error: unknown): {
  status: number;
  body: { error: string; kind: string };
} {
  if (error instanceof InvocationError) {
    const statusMap: Record<string, number> = {
      validation: 400,
      'not-found': 404,
      conflict: 409,
      forbidden: 403,
      timeout: 504,
      unavailable: 503,
      internal: 500,
    };
    return {
      status: statusMap[error.kind] ?? 500,
      body: { error: error.message, kind: error.kind },
    };
  }
  return {
    status: 500,
    body: { error: 'Internal server error', kind: 'internal' },
  };
}

export function registerKnowledgeWriteRoutes(
  app: FastifyInstance,
  module: KnowledgeWritePort,
): void {
  app.post('/internal/knowledge', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        content: string;
        actorId: string;
        title?: string;
        labels?: string[];
        teamId?: string;
      };
      const result = await module.submit(body);
      return reply.status(201).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.put('/internal/knowledge/:entryId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { entryId } = req.params as { entryId: string };
      const body = req.body as { updates: Record<string, unknown>; actorId: string };
      await module.updateEntry(entryId, body.updates, body.actorId);
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post(
    '/internal/knowledge/:entryId/resubmit',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { entryId } = req.params as { entryId: string };
        const body = req.body as { updates: Record<string, unknown>; actorId: string };
        await module.resubmit(entryId, body.updates, body.actorId);
        return reply.status(200).send({ ok: true });
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post(
    '/internal/knowledge/:entryId/supersede',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { entryId } = req.params as { entryId: string };
        const body = req.body as { replacementId: string; actorId: string };
        await module.supersede(entryId, body.replacementId, body.actorId);
        return reply.status(200).send({ ok: true });
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post('/internal/traps', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        content: string;
        teamId: string;
        actorId: string;
        title?: string;
      };
      const result = await module.createTrap(body);
      return reply.status(201).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/traps', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { teamId } = req.query as { teamId?: string };
      const result = await module.listTraps(teamId ?? '');
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/traps/:trapId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { trapId } = req.params as { trapId: string };
      const result = await module.getTrap(trapId);
      if (!result) {
        return reply.status(404).send({ error: 'Trap not found', kind: 'not-found' });
      }
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post(
    '/internal/knowledge/review/approve',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = req.body as {
          entryId: string;
          actorId: string;
          note?: string;
          evidence?: Record<string, unknown>;
        };
        const result = await module.approveReviewDecision(body);
        return reply.status(200).send(result);
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post(
    '/internal/knowledge/review/reject',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = req.body as {
          entryId: string;
          actorId: string;
          note?: string;
          evidence?: Record<string, unknown>;
        };
        const result = await module.rejectReviewDecision(body);
        return reply.status(200).send(result);
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post('/internal/knowledge/maintenance', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyMaintenanceDecision(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/knowledge/decay', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyDecayDecision(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/candidates/publish', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as {
        candidateId: string;
        actorId: string;
        result: Record<string, unknown>;
      };
      const result = await module.publishCandidateResult(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', service: 'knowledge-write' });
  });
}
