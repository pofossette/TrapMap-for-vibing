/**
 * Internal HTTP routes for the identity-access service.
 *
 * Thin transport layer -- all business logic lives in the identity-access
 * backend-core module. Routes delegate directly to the IdentityAccessPort.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityAccessPort } from '@trapmap/backend-core';
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
// Route registration
// ---------------------------------------------------------------------------

/**
 * Register all internal identity-access routes on the given Fastify instance.
 */
export function registerRoutes(app: FastifyInstance, identityAccessPort: IdentityAccessPort): void {
  // --- Auth routes ---

  // POST /internal/auth/login
  app.post('/internal/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['handle', 'password']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { handle: string; password: string };
      const result = await identityAccessPort.login(body.handle, body.password);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // POST /internal/auth/logout
  app.post('/internal/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string };
      await identityAccessPort.logout(body.sessionToken);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // POST /internal/auth/validate
  app.post('/internal/auth/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string };
      const result = await identityAccessPort.validateSession(body.sessionToken);
      if (!result) {
        return reply.status(401).send({ error: 'Invalid or expired session', kind: 'auth' });
      }
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // POST /internal/auth/select-team
  app.post('/internal/auth/select-team', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken', 'teamId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string; teamId: string };
      await identityAccessPort.selectTeam(body.sessionToken, body.teamId);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Team routes ---

  // POST /internal/teams
  app.post('/internal/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['name', 'slug', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { name: string; slug: string; actorId: string };
      const result = await identityAccessPort.createTeam(body.name, body.slug, body.actorId);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // GET /internal/teams
  app.get('/internal/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { userId: string };
      if (!query.userId) {
        return reply.status(400).send({
          error: 'Missing required query param: userId',
          kind: 'validation',
        });
      }
      const result = await identityAccessPort.listTeams(query.userId);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Member routes ---

  // POST /internal/members
  app.post('/internal/members', async (request: FastifyRequest, reply: FastifyReply) => {
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
      await identityAccessPort.addMember(body.teamId, body.userId, body.role, body.actorId);
      return reply.status(201).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // PUT /internal/members/:memberId
  app.put('/internal/members/:memberId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { memberId: string };
      const validationError = validateBody(request.body, ['actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { updates: Record<string, unknown>; actorId: string };
      await identityAccessPort.updateMember(params.memberId, body.updates ?? {}, body.actorId);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Access key routes ---

  // POST /internal/access-keys
  app.post('/internal/access-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['memberId', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { memberId: string; actorId: string };
      const result = await identityAccessPort.provisionAccessKey(body.memberId, body.actorId);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  // --- Health ---

  // GET /internal/health
  app.get('/internal/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      service: 'identity-access',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });
}
