/**
 * Internal HTTP routes for the candidate-ingestion service.
 *
 * Thin transport layer -- all business logic lives in the
 * candidate-ingestion backend-core module.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import type { CandidateIngestionPort } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';
import type { CandidateStatus } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

function translateInvocationError(error: unknown): { status: number; body: { error: string; kind: string } } {
  if (error instanceof InvocationError) {
    const statusMap: Record<string, number> = {
      'validation': 400,
      'not-found': 404,
      'conflict': 409,
      'forbidden': 403,
      'timeout': 504,
      'unavailable': 503,
      'internal': 500,
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

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerRoutes(app: FastifyInstance, module: CandidateIngestionPort): void {

  // POST /internal/candidates
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

  // GET /internal/candidates/:candidateId
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

  // GET /internal/candidates
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

  // POST /internal/candidates/:candidateId/resolution
  app.post('/internal/candidates/:candidateId/resolution', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { candidateId } = req.params as { candidateId: string };
      const body = req.body as { resolution: Record<string, unknown>; actorId: string };
      await module.applyResolution(candidateId, body.resolution, body.actorId);
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  // POST /internal/candidates/:candidateId/manual-result
  app.post('/internal/candidates/:candidateId/manual-result', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { candidateId } = req.params as { candidateId: string };
      const body = req.body as { result: Record<string, unknown>; actorId: string };
      await module.submitManualResult(candidateId, body.result, body.actorId);
      return reply.status(200).send({ ok: true });
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  // GET /internal/health
  app.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', service: 'candidate-ingestion' });
  });
}
