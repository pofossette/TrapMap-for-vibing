/**
 * Gateway external API routes.
 *
 * The gateway is the ONLY service exposed to external clients.
 * It receives external requests and forwards them to internal services
 * via HTTP. This is a thin transport layer -- all business logic
 * lives in the internal services.
 *
 * The `/v1` forwarding surface is defined once as framework-neutral
 * RouteDefs (`route-defs.ts`) and registered through the shared Fastify
 * adapter; per-route validation lives in the RouteDef Zod schemas. Only
 * the host-level surface stays here: the session auth hook, the public
 * probes (`/health`, `/live`, `/ready`) and the login route (it emits the
 * issued session token as a response header, which RouteDef handlers do
 * not express).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { registerFastifyRoutes } from '@trapmap/backend-core';

import type { InternalServiceClients } from './internal-client.js';
import { createGatewayRouteDefs, gatewayActorContext } from './route-defs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Paths that are publicly accessible without a session token. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/health',
  '/live',
  '/ready',
  '/metrics',
  '/v1/auth/login',
]);

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
    const identity = result.body as {
      userId?: string;
      handle?: string;
      activeTeamId?: string | null;
      securityLevel?: number;
    };
    if (identity.userId) {
      const authenticatedRequest = request as FastifyRequest & {
        actorId?: string;
        actorHandle?: string;
        actorTeamId?: string | null;
        actorSecurityLevel?: number;
      };
      authenticatedRequest.actorId = identity.userId;
      if (identity.handle !== undefined) authenticatedRequest.actorHandle = identity.handle;
      if (identity.activeTeamId !== undefined)
        authenticatedRequest.actorTeamId = identity.activeTeamId;
      if (identity.securityLevel !== undefined)
        authenticatedRequest.actorSecurityLevel = identity.securityLevel;
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

  registerFastifyRoutes(app, createGatewayRouteDefs(clients), clients, {
    context: gatewayActorContext,
  });

  // ---- Health ----

  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      service: 'gateway',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/live', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      service: 'gateway',
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  });

  // ---- Auth routes (identity-access) ----
  //
  // Login stays hand-written because it emits the issued session token as
  // a response header (`x-session-token`), which the RouteDef adapters do
  // not express. Validation follows the historical union branching.

  app.post('/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const loginBody = request.body as Record<string, unknown> | null;
    const isSystemAdminLogin = Boolean(loginBody && typeof loginBody.systemAdminKey === 'string');
    const requiredFields = isSystemAdminLogin ? ['systemAdminKey'] : ['handle', 'password'];
    const missing = requiredFields.filter(
      (field) => loginBody?.[field] === undefined || loginBody?.[field] === null,
    );
    if (missing.length > 0) {
      return reply.status(400).send({
        error: `Missing required fields: ${missing.join(', ')}`,
        kind: 'validation',
      });
    }
    try {
      if (isSystemAdminLogin) {
        const result = await clients.identityAccess.loginSystemAdmin({
          systemAdminKey: loginBody?.systemAdminKey as string,
        });
        const sessionToken = (result.body as { sessionToken?: unknown } | null)?.sessionToken;
        if (result.status >= 200 && result.status < 300 && typeof sessionToken === 'string') {
          reply.header('x-session-token', sessionToken);
        }
        return reply.status(result.status).send(result.body);
      }
      const result = await clients.identityAccess.login(
        request.body as { handle: string; password: string },
      );
      return reply.status(result.status).send(result.body);
    } catch (err: unknown) {
      request.log.error({ err }, 'identity-access login failed');
      return reply.status(502).send({ error: 'Identity service unavailable', kind: 'upstream' });
    }
  });
}
