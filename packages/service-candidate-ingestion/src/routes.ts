import type { CandidateIngestionPort } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';
import type { CandidateStatus } from '@trapmap/contracts';
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

function trustedActor(
  request: FastifyRequest,
  body: { actorId?: unknown },
): { actorId: string } | { status: number; body: { error: string; kind: string } } {
  const actorId = request.headers['x-trapmap-actor-id'];
  if (typeof actorId !== 'string' || !actorId) {
    return { status: 401, body: { error: 'Trusted actor is required', kind: 'forbidden' } };
  }
  if (typeof body.actorId === 'string' && body.actorId !== actorId) {
    return {
      status: 403,
      body: { error: 'Actor does not match trusted identity', kind: 'forbidden' },
    };
  }
  return { actorId };
}

export function registerCandidateIngestionRoutes(
  app: FastifyInstance,
  module: CandidateIngestionPort,
): void {
  app.post('/internal/candidates', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as Parameters<CandidateIngestionPort['submit']>[0];
      const result = await module.submit(body);
      return reply.status(201).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/candidates/:candidateId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { candidateId } = req.params as { candidateId: string };
      const result = await module.getById(candidateId);
      if (!result) {
        return reply.status(404).send({ error: 'Candidate not found', kind: 'not-found' });
      }
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/candidates', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { status } = req.query as { status?: string };
      const result = await module.listByStatus((status ?? 'received') as CandidateStatus);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post(
    '/internal/candidates/:candidateId/resolution',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { candidateId } = req.params as { candidateId: string };
        const body = req.body as { resolution: Record<string, unknown>; actorId?: unknown };
        const actor = trustedActor(req, body);
        if ('status' in actor) return reply.status(actor.status).send(actor.body);
        await module.applyResolution(candidateId, body.resolution, actor.actorId);
        return reply.status(200).send({ ok: true });
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post(
    '/internal/candidates/:candidateId/manual-result',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { candidateId } = req.params as { candidateId: string };
        const body = req.body as { result: Record<string, unknown>; actorId?: unknown };
        const actor = trustedActor(req, body);
        if ('status' in actor) return reply.status(actor.status).send(actor.body);
        await module.submitManualResult(candidateId, body.result, actor.actorId);
        return reply.status(200).send({ ok: true });
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.post(
    '/internal/candidates/:candidateId/publish',
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const { candidateId } = req.params as { candidateId: string };
        const body = req.body as { result: Record<string, unknown>; actorId?: unknown };
        const actor = trustedActor(req, body);
        if ('status' in actor) return reply.status(actor.status).send(actor.body);
        const result = await module.publishCandidateResult(candidateId, body.result, actor.actorId);
        return reply.status(200).send(result);
      } catch (err) {
        const { status, body } = translateInvocationError(err);
        return reply.status(status).send(body);
      }
    },
  );

  app.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', service: 'candidate-ingestion' });
  });
}
