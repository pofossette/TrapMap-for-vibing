/**
 * Internal HTTP routes for the identity-access service.
 *
 * Thin transport layer -- all business logic lives in the identity-access
 * backend-core module. Routes delegate directly to the IdentityAccessPort.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityAccessPort } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';

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

function validateBody(
  body: unknown,
  requiredFields: string[],
): { error: string; kind: string } | null {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required', kind: 'validation' };
  }
  const record = body as Record<string, unknown>;
  const missing = requiredFields.filter(
    (field) => record[field] === undefined || record[field] === null,
  );
  if (missing.length > 0) {
    return {
      error: `Missing required fields: ${missing.join(', ')}`,
      kind: 'validation',
    };
  }
  return null;
}

export function registerIdentityAccessRoutes(
  app: FastifyInstance,
  module: IdentityAccessPort,
): void {
  app.post('/internal/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['handle', 'password']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { handle: string; password: string };
      const result = await module.login(body.handle, body.password);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string };
      await module.logout(body.sessionToken);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/auth/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string };
      const result = await module.validateSession(body.sessionToken);
      if (!result) {
        return reply.status(401).send({ error: 'Invalid or expired session', kind: 'auth' });
      }
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/auth/select-team', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['sessionToken', 'teamId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { sessionToken: string; teamId: string };
      await module.selectTeam(body.sessionToken, body.teamId);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['name', 'slug', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { name: string; slug: string; actorId: string };
      const result = await module.createTeam(body.name, body.slug, body.actorId);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { userId: string };
      if (!query.userId) {
        return reply.status(400).send({
          error: 'Missing required query param: userId',
          kind: 'validation',
        });
      }
      const result = await module.listTeams(query.userId);
      return reply.status(200).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

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
      await module.addMember(body.teamId, body.userId, body.role, body.actorId);
      return reply.status(201).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.put('/internal/members/:memberId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { memberId: string };
      const validationError = validateBody(request.body, ['actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { updates: Record<string, unknown>; actorId: string };
      await module.updateMember(params.memberId, body.updates ?? {}, body.actorId);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.post('/internal/access-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validationError = validateBody(request.body, ['memberId', 'actorId']);
      if (validationError) {
        return reply.status(400).send(validationError);
      }
      const body = request.body as { memberId: string; actorId: string };
      const result = await module.provisionAccessKey(body.memberId, body.actorId);
      return reply.status(201).send(result);
    } catch (error) {
      const { status, body } = translateInvocationError(error);
      return reply.status(status).send(body);
    }
  });

  app.get('/internal/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      service: 'identity-access',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });
}
