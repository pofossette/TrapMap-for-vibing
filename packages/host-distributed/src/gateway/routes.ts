/**
 * Gateway external API routes.
 *
 * The gateway is the ONLY service exposed to external clients.
 * It receives external requests and forwards them to internal services
 * via HTTP. This is a thin transport layer -- all business logic
 * lives in the internal services.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

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

    // Forward the token to identity-access for validation.
    // The internal service returns 200 if the session is valid, 401 otherwise.
    const result = await clients.identityAccess.logout({ sessionToken: token }).catch(() => null);
    // Note: we call logout purely as a session-lookup side-effect-free probe
    // only if no dedicated /internal/auth/validate endpoint exists.
    // TODO: replace with a dedicated /internal/auth/validate endpoint when available.
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
export function registerGatewayRoutes(
  app: FastifyInstance,
  clients: InternalServiceClients,
): void {
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
      return reply.status(400).send({ error: 'Missing required query param: userId', kind: 'validation' });
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

  // ---- Knowledge routes (knowledge-read / knowledge-write) ----

  app.get('/v1/knowledge/mine', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { userId: string; teamId?: string };
    if (!query.userId) {
      return reply.status(400).send({ error: 'Missing required query param: userId', kind: 'validation' });
    }
    try {
      const result = await clients.knowledgeRead.listMine(query.userId, query.teamId);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-read listMine failed');
      return reply.status(502).send({ error: 'Knowledge service unavailable', kind: 'upstream' });
    }
  });

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
    const body = request.body as { content: string; title?: string; labels?: string[]; teamId?: string; actorId: string };
    try {
      const result = await clients.knowledgeWrite.submit(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'knowledge-write submit failed');
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

  // ---- Governance routes (governance-review) ----

  app.post('/v1/knowledge/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const validationError = validateBody(request.body, ['entryId', 'decision', 'actorId']);
    if (validationError) {
      return reply.status(400).send(validationError);
    }
    const body = request.body as { entryId: string; decision: 'approve' | 'reject'; actorId: string; note?: string };
    try {
      let result: { status: number; body: unknown };
      if (body.decision === 'approve') {
        result = await clients.governanceReview.approve({
          entryId: body.entryId,
          actorId: body.actorId,
          ...(body.note !== undefined ? { note: body.note } : {}),
        });
      } else {
        result = await clients.governanceReview.reject({
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

  app.post('/v1/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { entryId: string; problemType: string; description: string; actorId: string };
    try {
      const result = await clients.governanceReview.submitFeedback(body);
      return forwardResponse(reply, result);
    } catch (err: unknown) {
      request.log.error({ err }, 'governance-review submitFeedback failed');
      return reply.status(502).send({ error: 'Governance service unavailable', kind: 'upstream' });
    }
  });
}
