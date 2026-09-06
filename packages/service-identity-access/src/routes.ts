/**
 * Internal HTTP routes for the identity-access service, defined once as
 * framework-neutral RouteDefs.
 *
 * Thin transport layer -- all business logic lives in the identity-access
 * backend-core module. Handlers delegate directly to the IdentityAccessPort
 * and throw on error; the adapters map errors to responses.
 */

import {
  type HttpMethod,
  type IdentityAccessPort,
  type RouteContext,
  type RouteDef,
  registerFastifyRoutes,
  routeResponse,
} from '@trapmap/backend-core';
import { loginResponseSchema } from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';

const emptyRecord = z.record(z.string(), z.unknown());

const loginSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ handle: z.string(), password: z.string() }),
});

const systemAdminLoginSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ systemAdminKey: z.string() }),
});

const sessionTokenSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ sessionToken: z.string() }),
});

const selectTeamSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ sessionToken: z.string(), teamId: z.string() }),
});

const createTeamSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ name: z.string(), slug: z.string(), actorId: z.string() }),
});

const listTeamsSchema = z.object({
  params: emptyRecord,
  query: z.object({ userId: z.string() }),
  body: z.unknown(),
});

const addMemberSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    teamId: z.string(),
    userId: z.string(),
    role: z.string(),
    actorId: z.string(),
  }),
});

const updateMemberSchema = z.object({
  params: z.object({ memberId: z.string() }),
  query: emptyRecord,
  body: z.object({
    actorId: z.string(),
    updates: z.record(z.string(), z.unknown()).optional(),
  }),
});

const provisionAccessKeySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ memberId: z.string(), actorId: z.string() }),
});

const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

function identityRouteDef<Ctx extends RouteContext>(def: {
  method: HttpMethod;
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: IdentityAccessPort): Promise<unknown>;
}): RouteDef<Ctx, IdentityAccessPort> {
  return def;
}

export function createIdentityAccessRouteDefs(_module: IdentityAccessPort): RouteDef[] {
  return [
    identityRouteDef({
      method: 'POST',
      path: '/internal/auth/login',
      schema: loginSchema,
      handler: async (ctx, deps) => {
        const result = await deps.login(ctx.body.handle, ctx.body.password);
        const session = await deps.describeSession(result.sessionToken);
        if (!session) {
          throw new Error('Login succeeded but no session could be described');
        }
        // Fail loud on contract drift: the external login body must stay
        // exactly `{ session }` (token travels via header at the gateway).
        const parsed = loginResponseSchema.parse({ session });
        return { session: parsed.session, sessionToken: result.sessionToken };
      },
    }),

    identityRouteDef({
      method: 'POST',
      path: '/internal/auth/system-admin-login',
      schema: systemAdminLoginSchema,
      handler: async (ctx, deps) => {
        const result = await deps.loginSystemAdmin(ctx.body.systemAdminKey);
        const session = await deps.describeSession(result.sessionToken);
        if (!session) {
          throw new Error('Login succeeded but no session could be described');
        }
        const parsed = loginResponseSchema.parse({ session });
        return { session: parsed.session, sessionToken: result.sessionToken };
      },
    }),

    identityRouteDef({
      method: 'POST',
      path: '/internal/auth/logout',
      schema: sessionTokenSchema,
      handler: async (ctx, deps) => {
        await deps.logout(ctx.body.sessionToken);
        return { ok: true };
      },
    }),

    identityRouteDef({
      method: 'POST',
      path: '/internal/auth/validate',
      schema: sessionTokenSchema,
      handler: async (ctx, deps) => {
        const result = await deps.validateSession(ctx.body.sessionToken);
        if (!result) {
          return routeResponse(401, { error: 'Invalid or expired session', kind: 'auth' });
        }
        return result;
      },
    }),

    identityRouteDef({
      method: 'POST',
      path: '/internal/auth/select-team',
      schema: selectTeamSchema,
      handler: async (ctx, deps) => {
        await deps.selectTeam(ctx.body.sessionToken, ctx.body.teamId);
        return { ok: true };
      },
    }),

    identityRouteDef({
      method: 'POST',
      path: '/internal/teams',
      schema: createTeamSchema,
      successStatus: 201,
      handler: async (ctx, deps) => {
        const result = await deps.createTeam(ctx.body.name, ctx.body.slug, ctx.body.actorId);
        return result;
      },
    }),

    identityRouteDef({
      method: 'GET',
      path: '/internal/teams',
      schema: listTeamsSchema,
      handler: async (ctx, deps) => {
        const result = await deps.listTeams(ctx.query.userId);
        return result;
      },
    }),

    identityRouteDef({
      method: 'POST',
      path: '/internal/members',
      schema: addMemberSchema,
      successStatus: 201,
      handler: async (ctx, deps) => {
        await deps.addMember(ctx.body.teamId, ctx.body.userId, ctx.body.role, ctx.body.actorId);
        return { ok: true };
      },
    }),

    identityRouteDef({
      method: 'PUT',
      path: '/internal/members/:memberId',
      schema: updateMemberSchema,
      handler: async (ctx, deps) => {
        await deps.updateMember(ctx.params.memberId, ctx.body.updates ?? {}, ctx.body.actorId);
        return { ok: true };
      },
    }),

    identityRouteDef({
      method: 'POST',
      path: '/internal/access-keys',
      schema: provisionAccessKeySchema,
      successStatus: 201,
      handler: async (ctx, deps) => {
        const result = await deps.provisionAccessKey(ctx.body.memberId, ctx.body.actorId);
        return result;
      },
    }),

    identityRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async () => ({
        service: 'identity-access',
        status: 'ok',
        timestamp: new Date().toISOString(),
      }),
    }),
  ];
}

/**
 * Fastify-plugin compatibility shim: registers the identity-access RouteDefs
 * onto an existing Fastify instance. Consumed by the host-distributed bridge.
 */
export function registerIdentityAccessRoutes(
  app: FastifyInstance,
  module: IdentityAccessPort,
): void {
  registerFastifyRoutes(app, createIdentityAccessRouteDefs(module), module);
}
