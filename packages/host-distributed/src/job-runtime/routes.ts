/**
 * Internal HTTP routes for the job-runtime service.
 *
 * Thin transport layer -- all business logic lives in the
 * job-runtime backend-core module.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { JobRuntimePort } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';

// ---------------------------------------------------------------------------
// Error translation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerRoutes(app: FastifyInstance, module: JobRuntimePort): void {
  // POST /internal/jobs - schedule a job
  app.post('/internal/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as {
        type: string;
        payload: unknown;
        delayMs?: number;
        priority?: number;
        maxAttempts?: number;
      };
      const jobId = await module.schedule(body.type, body.payload, {
        ...(body.delayMs !== undefined ? { delayMs: body.delayMs } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.maxAttempts !== undefined ? { maxAttempts: body.maxAttempts } : {}),
      });
      return reply.status(201).send({ jobId });
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  // GET /internal/jobs/:jobId - get job status
  app.get('/internal/jobs/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };
      const result = await module.getStatus(jobId);
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  // GET /internal/jobs/queue - get queue status
  app.get('/internal/jobs/queue', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await module.getQueueStatus();
      return reply.status(200).send(result);
    } catch (err) {
      const { status, body } = translateInvocationError(err);
      return reply.status(status).send(body);
    }
  });

  // GET /internal/health
  app.get('/internal/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({ status: 'ok', service: 'job-runtime' });
  });
}
