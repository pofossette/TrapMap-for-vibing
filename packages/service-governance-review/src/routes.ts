import type { ReviewPort } from '@trapmap/backend-core';
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

export function registerGovernanceReviewRoutes(app: FastifyInstance, module: ReviewPort): void {
  app.post('/internal/review/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.approve(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/reject', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.reject(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/maintenance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyMaintenance(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/decay', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      };
      const result = await module.applyDecay(body);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/review/artifact', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        artifactId: string;
        decision: 'approve' | 'reject';
        actorId: string;
        note?: string;
      };
      await module.reviewArtifact(body.artifactId, body.decision, body.actorId, body.note);
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        entryId: string;
        problemType: string;
        description: string;
        actorId: string;
      };
      const result = await module.submitFeedback(body);
      return reply.status(201).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', service: 'governance-review' });
  });
}
