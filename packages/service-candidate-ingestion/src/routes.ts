import type { CandidateIngestionPort } from '@trapmap/backend-core';
import { InvocationError, toInvocationErrorResponse } from '@trapmap/backend-core';
import type { CandidateStatus } from '@trapmap/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function translateInvocationError(error: unknown) {
  return toInvocationErrorResponse(error);
}

function trustedActor(
  request: FastifyRequest,
  body: unknown,
): { actorId: string } | { status: number; body: { error: string; kind: string } } {
  const actorId = request.headers['x-trapmap-actor-id'];
  if (typeof actorId !== 'string' || !actorId) {
    return { status: 401, body: { error: 'Trusted actor is required', kind: 'forbidden' } };
  }
  const bodyActorId =
    typeof body === 'object' && body !== null && 'actorId' in body
      ? (body as { actorId?: unknown }).actorId
      : undefined;
  if (typeof bodyActorId === 'string' && bodyActorId !== actorId) {
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
  const invoke = async <T>(reply: FastifyReply, operation: () => Promise<T>, status = 200) => {
    try {
      return reply.status(status).send(await operation());
    } catch (err) {
      const response = translateInvocationError(err);
      return reply.status(response.status).send(response.body);
    }
  };
  const invokeTrusted = async <T>(
    req: FastifyRequest,
    reply: FastifyReply,
    body: unknown,
    operation: (actorId: string) => Promise<T>,
  ) => {
    const actor = trustedActor(req, body);
    if ('status' in actor) return reply.status(actor.status).send(actor.body);
    return invoke(reply, () => operation(actor.actorId));
  };
  const registerTrustedMutation = (
    path: string,
    field: 'resolution' | 'result',
    operation: (
      candidateId: string,
      value: Record<string, unknown>,
      actorId: string,
    ) => Promise<unknown>,
  ) => {
    app.post(path, async (req: FastifyRequest, reply: FastifyReply) => {
      const { candidateId } = req.params as { candidateId: string };
      const body = req.body as {
        actorId?: unknown;
        resolution?: Record<string, unknown>;
        result?: Record<string, unknown>;
      };
      return invokeTrusted(req, reply, body, (actorId) =>
        operation(candidateId, body[field]!, actorId),
      );
    });
  };

  app.post('/internal/candidates', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as Parameters<CandidateIngestionPort['submit']>[0];
    return invoke(reply, () => module.submit(body), 201);
  });

  app.get('/internal/candidates/:candidateId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { candidateId } = req.params as { candidateId: string };
    return invoke(reply, async () => {
      const result = await module.getById(candidateId);
      if (!result) throw InvocationError.notFound('Candidate not found');
      return result;
    });
  });

  app.get('/internal/candidates', async (req: FastifyRequest, reply: FastifyReply) => {
    const { status } = req.query as { status?: string };
    return invoke(reply, () => module.listByStatus((status ?? 'received') as CandidateStatus));
  });

  registerTrustedMutation(
    '/internal/candidates/:candidateId/resolution',
    'resolution',
    (candidateId, value, actorId) =>
      module.applyResolution(candidateId, value, actorId).then(() => ({ ok: true })),
  );
  registerTrustedMutation(
    '/internal/candidates/:candidateId/manual-result',
    'result',
    (candidateId, value, actorId) =>
      module.submitManualResult(candidateId, value, actorId).then(() => ({ ok: true })),
  );

  app.post(
    '/internal/candidates/:candidateId/publish',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { candidateId } = req.params as { candidateId: string };
      const body = req.body as { result: Record<string, unknown>; actorId?: unknown };
      return invokeTrusted(req, reply, body, (actorId) =>
        module.publishCandidateResult(candidateId, body.result, actorId),
      );
    },
  );

  app.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', service: 'candidate-ingestion' });
  });
}
