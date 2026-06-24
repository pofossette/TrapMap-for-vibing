/**
 * Gateway external API routes.
 *
 * The gateway is the ONLY service exposed to external clients.
 * It receives external requests and forwards them to internal services
 * via HTTP. This is a thin transport layer -- all business logic
 * lives in the internal services.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { InternalServiceClients } from './internal-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Paths that are publicly accessible without a session token. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/health',
  '/v1/auth/login',
  '/v1/auth/register',
]);

function forwardResponse(reply: FastifyReply, result: { status: number; body: unknown }) {
  return reply.status(result.status).send(result.body);
}

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

/**
 * Extract the session token from the Authorization header.
 * Expects the format: `Bearer <token>`.
 * Returns the token string, or null if absent / malformed.
 */
function extractSessionToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7) || null;
}

// ---------------------------------------------------------------------------
// Authentication hook
// ---------------------------------------------------------------------------

/**
 * Register an `onRequest` hook that requires a valid Bearer session token
 * on every route NOT in the public allowlist.  The token is forwarded to
 * the identity-access service for validation; a missing or rejected token
 * yields a 401 response before the route handler runs.
 */
function registerAuthHook(app: FastifyInstance, clients: InternalServiceClients): void {
  app.addHook('onRequest', async (request, reply) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    if (PUBLIC_PATHS.has(path)) return;

    const token = extractSessionToken(request);
    if (!token) {
      return reply.status(401).send({ error: 'Missing session token', kind: 'auth' });
    }

    const result = await clients.identityAccess
      .validateSession({ sessionToken: token })
      .catch(() => null);
    if (!result || result.status === 401) {
      return reply.status(401).send({ error: 'Invalid or expired session', kind: 'auth' });
    }
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register all external gateway routes.
 *
 * These are the public-facing API endpoints that clients use.
 * Each route forwards to the appropriate internal service.
 */
export function registerGatewayRoutes(app: FastifyInstance, clients: InternalServiceClients): void {
  // Apply authentication middleware (skips public paths)
  registerAuthHook(app, clients);

  // ---- Health ----

  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      service: 'gateway',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // ---- Auth routes (identity-access) ----

  app.post('/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['handle', 'password']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { handle: string; password: string };
    try {
      const result = await clients.identityAccess.login(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access login failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['sessionToken']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { sessionToken: string };
    try {
      const result = await clients.identityAccess.logout(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access logout failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  // ---- Team routes (identity-access) ----

  app.post('/v1/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['name', 'slug', 'actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { name: string; slug: string; actorId: string };
    try {
      const result = await clients.identityAccess.createTeam(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access createTeam failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  app.get('/v1/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { userId: string };
    if (!query.userId) {
      return reply
        .status(400)
        .send({ error: 'Missing required query param: userId', kind: 'validation' });
    }
    try {
      const result = await clients.identityAccess.listTeams(query.userId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access listTeams failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/teams/select', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['sessionToken', 'teamId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { sessionToken: string; teamId: string };
    try {
      const result = await clients.identityAccess.selectTeam(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access selectTeam failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  // ---- Member routes (identity-access) ----

  app.post('/v1/members', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['teamId', 'userId', 'role', 'actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { teamId: string; userId: string; role: string; actorId: string };
    try {
      const result = await clients.identityAccess.addMember(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access addMember failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  app.put('/v1/members/:memberId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { memberId: string };
    const validationError = validateBody(request.body, ['actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { updates?: Record<string, unknown>; actorId: string };
    try {
      const result = await clients.identityAccess.updateMember(params.memberId, {
        updates: body.updates ?? {},
        actorId: body.actorId,
      });
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access updateMember failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/access-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['memberId', 'actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { memberId: string; actorId: string };
    try {
      const result = await clients.identityAccess.provisionAccessKey(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access provisionAccessKey failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });

  // ---- Knowledge routes (knowledge-read / knowledge-write) ----

  app.get('/v1/knowledge/mine', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { userId: string; teamId?: string };
    if (!query.userId) {
      return reply
        .status(400)
        .send({ error: 'Missing required query param: userId', kind: 'validation' });
    }
    try {
      const result = await clients.knowledgeRead.listMine(query.userId, query.teamId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-read listMine failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  app.get(
    '/v1/knowledge/projection-status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await clients.knowledgeRead.getProjectionStatus();
        return forwardResponse(reply, result);
      } catch (err: unknown) {
        request.log.error({ err }, 'knowledge-read projection-status failed');
        return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
      }
    },
  );

  app.get('/v1/knowledge/:entryId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { entryId: string };
    try {
      const result = await clients.knowledgeRead.getById(params.entryId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-read getById failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
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
    try {
      const result = await clients.knowledgeWrite.submit(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-write submit failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  app.put('/v1/knowledge/:entryId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { entryId: string };
    const validationError = validateBody(request.body, ['actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { updates?: Record<string, unknown>; actorId: string };
    try {
      const result = await clients.knowledgeWrite.updateEntry(params.entryId, {
        updates: body.updates ?? {},
        actorId: body.actorId,
      });
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-write updateEntry failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  app.post(
    '/v1/knowledge/:entryId/resubmit',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { entryId: string };
      const validationError = validateBody(request.body, ['actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { actorId: string; note?: string };
      try {
        const result = await clients.knowledgeWrite.resubmit(params.entryId, body);
        return forwardResponse(reply, result);
      } catch (err: unknown) {
        request.log.error({ err }, 'knowledge-write resubmit failed');
        return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
      }
    },
  );

  app.post(
    '/v1/knowledge/:entryId/supersede',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { entryId: string };
      const validationError = validateBody(request.body, ['replacementId', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { replacementId: string; actorId: string };
      try {
        const result = await clients.knowledgeWrite.supersede(params.entryId, body);
        return forwardResponse(reply, result);
      } catch (err: unknown) {
        request.log.error({ err }, 'knowledge-write supersede failed');
        return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
      }
    },
  );

  app.post('/v1/traps', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['content', 'teamId', 'actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as {
      content: string;
      teamId: string;
      actorId: string;
      title?: string;
    };
    try {
      const result = await clients.knowledgeWrite.createTrap(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-write createTrap failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  app.get('/v1/traps', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { teamId?: string };
    if (!query.teamId) {
      return reply
        .status(400)
        .send({ error: 'Missing required query param: teamId', kind: 'validation' });
    }
    try {
      const result = await clients.knowledgeWrite.listTraps(query.teamId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-write listTraps failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  app.get('/v1/traps/:trapId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { trapId: string };
    try {
      const result = await clients.knowledgeWrite.getTrap(params.trapId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-write getTrap failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  // ---- Retrieval routes (knowledge-read) ----

  app.post('/v1/retrieval/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['query']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { query: string; teamId?: string; limit?: number };
    try {
      const result = await clients.knowledgeRead.search(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-read search failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v3/retrieval/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['query']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { query: string; teamId?: string; limit?: number };
    try {
      const result = await clients.knowledgeRead.search(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-read search (v3) failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

  // ---- Candidate routes (candidate-ingestion) ----

  app.post('/v1/candidates', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { id: string; content: string; submittedBy: string };
    try {
      const result = await clients.candidateIngestion.submit(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'candidate-ingestion submit failed');
      return reply.status(502).send({ error: 'Candidate service unavailable', kind: 'upstream' });
    }
  });

  app.get('/v1/candidates/:candidateId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { candidateId: string };
    try {
      const result = await clients.candidateIngestion.getById(params.candidateId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'candidate-ingestion getById failed');
      return reply.status(502).send({ error: 'Candidate service unavailable', kind: 'upstream' });
    }
  });

  app.get('/v1/candidates', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { status?: string };
    try {
      const result = await clients.candidateIngestion.listByStatus(query.status ?? 'received');
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'candidate-ingestion listByStatus failed');
      return reply.status(502).send({ error: 'Candidate service unavailable', kind: 'upstream' });
    }
  });

  app.post(
    '/v1/candidates/:candidateId/resolution',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { candidateId: string };
      const validationError = validateBody(request.body, ['resolution', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { resolution: Record<string, unknown>; actorId: string };
      try {
        const result = await clients.candidateIngestion.applyResolution(params.candidateId, body);
        return forwardResponse(reply, result);
      } catch (err: unknown) {
        request.log.error({ err }, 'candidate-ingestion applyResolution failed');
        return reply.status(502).send({ error: 'Candidate service unavailable', kind: 'upstream' });
      }
    },
  );

  app.post(
    '/v1/candidates/:candidateId/manual-result',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { candidateId: string };
      const validationError = validateBody(request.body, ['result', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { result: Record<string, unknown>; actorId: string };
      try {
        const result = await clients.candidateIngestion.submitManualResult(
          params.candidateId,
          body,
        );
        return forwardResponse(reply, result);
      } catch (err: unknown) {
        request.log.error({ err }, 'candidate-ingestion submitManualResult failed');
        return reply.status(502).send({ error: 'Candidate service unavailable', kind: 'upstream' });
      }
    },
  );

  // ---- Governance routes (governance-review) ----

  app.post('/v1/knowledge/review', async (request: FastifyRequest, reply: FastifyReply) => {
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
    try {
      let result: { status: number; body: unknown };
      if (body.decision === 'approve') {
        result = await clients.review.approve({
          entryId: body.entryId,
          actorId: body.actorId,
          ...(body.note !== undefined ? { note: body.note } : {}),
        });
      } else {
        result = await clients.review.reject({
          entryId: body.entryId,
          actorId: body.actorId,
          ...(body.note !== undefined ? { note: body.note } : {}),
        });
      }
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'governance-review approve/reject failed');
      return reply.status(502).send({ error: 'Governance service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/knowledge/maintenance', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['entryId', 'actorId', 'action']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as {
      entryId: string;
      actorId: string;
      action: string;
      note?: string;
      evidence?: Record<string, unknown>;
    };
    try {
      const result = await clients.review.applyMaintenance(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'governance-review maintenance failed');
      return reply.status(502).send({ error: 'Governance service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/knowledge/decay', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['entryId', 'actorId', 'action']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as {
      entryId: string;
      actorId: string;
      action: string;
      note?: string;
      evidence?: Record<string, unknown>;
    };
    try {
      const result = await clients.review.applyDecay(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'governance-review decay failed');
      return reply.status(502).send({ error: 'Governance service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      entryId: string;
      problemType: string;
      description: string;
      actorId: string;
    };
    try {
      const result = await clients.review.submitFeedback(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'governance-review submitFeedback failed');
      return reply.status(502).send({ error: 'Governance service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/artifacts/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['artifactId', 'decision', 'actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as {
      artifactId: string;
      decision: 'approve' | 'reject';
      actorId: string;
      note?: string;
    };
    try {
      const result = await clients.review.reviewArtifact(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'governance-review reviewArtifact failed');
      return reply.status(502).send({ error: 'Governance service unavailable', kind: 'upstream' });
    }
  });

  app.post('/v1/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['type', 'payload']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as {
      type: string;
      payload: unknown;
      delayMs?: number;
      priority?: number;
      maxAttempts?: number;
    };
    try {
      const result = await clients.jobRuntime.schedule(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'job-runtime schedule failed');
      return reply.status(502).send({ error: 'Job service unavailable', kind: 'upstream' });
    }
  });

  app.get('/v1/jobs/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { jobId: string };
    try {
      const result = await clients.jobRuntime.getStatus(params.jobId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'job-runtime getStatus failed');
      return reply.status(502).send({ error: 'Job service unavailable', kind: 'upstream' });
    }
  });

  app.get('/v1/jobs/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await clients.jobRuntime.getQueueStatus();
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'job-runtime getQueueStatus failed');
      return reply.status(502).send({ error: 'Job service unavailable', kind: 'upstream' });
    }
  });
}
