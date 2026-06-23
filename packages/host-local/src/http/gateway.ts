/**
 * Gateway HTTP endpoint handlers.
 *
 * Maps HTTP requests to backend-core module ports.
 * This is a thin transport layer -- all business logic lives in backend-core modules.
 * Routes are registered based on deployment profile capabilities.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type {
  CandidateIngestionPort,
  IdentityAccessPort,
  JobRuntimePort,
  KnowledgeReadPort,
  KnowledgeWritePort,
  ReviewPort,
} from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';
import type { ResolvedRuntimeDeployment } from '@trapmap/backend-core';

// ---------------------------------------------------------------------------
// Gateway handler dependencies
// ---------------------------------------------------------------------------

export interface GatewayHandlerDeps {
  identityAccess: IdentityAccessPort;
  knowledgeRead: KnowledgeReadPort;
  knowledgeWrite: KnowledgeWritePort;
  candidateIngestion: CandidateIngestionPort;
  review: ReviewPort;
  jobRuntime: JobRuntimePort;
}

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
// Request body validation
// ---------------------------------------------------------------------------

/**
 * Validate that the request body contains all required fields.
 * Returns null if valid, or a 400-shaped error object if not.
 */
function validateBody(
  body: unknown,
  requiredFields: string[],
): { error: string; kind: string } | null {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required', kind: 'validation' };
  }
  const record = body as Record<string, unknown>;
  const missing = requiredFields.filter((f) => record[f] === undefined || record[f] === null);
  if (missing.length > 0) {
    return {
      error: `Missing required fields: ${missing.join(', ')}`,
      kind: 'validation',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared retrieval routes (used by both minimal and core surfaces)
// ---------------------------------------------------------------------------

function registerRetrievalRoutes(app: FastifyInstance, knowledgeRead: KnowledgeReadPort): void {
  // POST /v1/retrieval/search
  app.post('/v1/retrieval/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['query']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { query: string; teamId?: string; limit?: number };
      const result = await knowledgeRead.search(body);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // POST /v3/retrieval/search
  app.post('/v3/retrieval/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['query']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { query: string; teamId?: string; limit?: number };
      const result = await knowledgeRead.search(body);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register minimal retrieval-first routes for local-agent profile.
 */
function registerMinimalRoutes(app: FastifyInstance, deps: GatewayHandlerDeps): void {
  registerRetrievalRoutes(app, deps.knowledgeRead);
}

/**
 * Register core gateway API routes (team-monolith full surface).
 */
function registerCoreRoutes(app: FastifyInstance, deps: GatewayHandlerDeps): void {
  // --- Auth routes ---

  app.post('/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['handle', 'password']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { handle: string; password: string };
      const result = await deps.identityAccess.login(body.handle, body.password);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string };
      await deps.identityAccess.logout(body.sessionToken);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Team routes ---

  app.post('/v1/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['name', 'slug', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { name: string; slug: string; actorId: string };
      const result = await deps.identityAccess.createTeam(body.name, body.slug, body.actorId);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.get('/v1/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { userId: string };
      const result = await deps.identityAccess.listTeams(query.userId);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/v1/teams/select', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken', 'teamId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string; teamId: string };
      await deps.identityAccess.selectTeam(body.sessionToken, body.teamId);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Member routes ---

  app.post('/v1/members', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['teamId', 'userId', 'role', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as {
        teamId: string;
        userId: string;
        role: string;
        actorId: string;
      };
      await deps.identityAccess.addMember(body.teamId, body.userId, body.role, body.actorId);
      return reply.status(201).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Knowledge routes ---

  app.get('/v1/knowledge/mine', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { userId: string; teamId?: string };
      const result = await deps.knowledgeRead.listMine(query.userId, query.teamId);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.get('/v1/knowledge/:entryId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { entryId: string };
      const result = await deps.knowledgeRead.getById(params.entryId);
      if (!result) {
        return reply.status(404).send({ error: 'Knowledge entry not found', kind: 'not-found' });
      }
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/v1/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['content', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as {
        content: string;
        title?: string;
        labels?: string[];
        teamId?: string;
        actorId: string;
      };
      const result = await deps.knowledgeWrite.submit(body);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Retrieval routes (shared implementation) ---

  registerRetrievalRoutes(app, deps.knowledgeRead);

  // --- Candidate routes ---

  app.post('/v1/candidates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as Parameters<CandidateIngestionPort['submit']>[0];
      const result = await deps.candidateIngestion.submit(body);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.get('/v1/candidates/:candidateId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { candidateId: string };
      const result = await deps.candidateIngestion.getById(params.candidateId);
      if (!result) {
        return reply.status(404).send({ error: 'Candidate not found', kind: 'not-found' });
      }
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Governance routes ---

  app.post('/v1/knowledge/review', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['entryId', 'decision', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as {
        entryId: string;
        decision: 'approve' | 'reject';
        actorId: string;
        note?: string;
      };
      if (body.decision === 'approve') {
        await deps.review.approve({
          entryId: body.entryId,
          actorId: body.actorId,
          ...(body.note !== undefined ? { note: body.note } : {}),
        });
      } else {
        await deps.review.reject({
          entryId: body.entryId,
          actorId: body.actorId,
          ...(body.note !== undefined ? { note: body.note } : {}),
        });
      }
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/v1/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as Parameters<ReviewPort['submitFeedback']>[0];
      const result = await deps.review.submitFeedback(body);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });
}

/**
 * Register gateway routes based on deployment profile capabilities.
 */
export function registerGatewayRoutes(
  app: FastifyInstance,
  deps: GatewayHandlerDeps,
  deployment: ResolvedRuntimeDeployment,
): void {
  if (deployment.capabilities.routeSurface === 'minimal-agent') {
    registerMinimalRoutes(app, deps);
  } else if (deployment.capabilities.routeSurface === 'gateway-core') {
    registerCoreRoutes(app, deps);
  }
  // 'worker-status' surface gets no gateway routes (only health/status from registerHealthRoutes)
}
