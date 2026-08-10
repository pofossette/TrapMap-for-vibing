import {
  InvocationError,
  type RouteContext,
  type RouteDef,
  registerFastifyRoutes,
  routeResponse,
} from '@trapmap/backend-core';
import type { KnowledgeReadPort } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';

const emptyRecord = z.record(z.string(), z.unknown());

const entryParamsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const mineSchema = z.object({
  params: emptyRecord,
  query: z.object({
    userId: z.string(),
    teamId: z.string().optional(),
  }),
  body: z.unknown(),
});

const searchSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    query: z.string(),
    teamId: z.string().optional(),
    limit: z.number().optional(),
  }),
});

const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

function knowledgeReadRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: KnowledgeReadPort): Promise<unknown>;
}): RouteDef<Ctx, KnowledgeReadPort> {
  return def;
}

export function createKnowledgeReadRouteDefs(
  _module: KnowledgeReadPort,
): RouteDef<RouteContext, KnowledgeReadPort>[] {
  return [
    knowledgeReadRouteDef({
      method: 'GET',
      path: '/internal/knowledge/:entryId',
      schema: entryParamsSchema,
      handler: async (ctx, deps) => {
        const entry = await deps.getById(ctx.params.entryId);
        if (!entry) {
          throw InvocationError.notFound('Knowledge entry not found');
        }
        return entry;
      },
    }),

    knowledgeReadRouteDef({
      method: 'GET',
      path: '/internal/knowledge/mine',
      schema: mineSchema,
      handler: async (ctx, deps) => {
        return deps.listMine(ctx.query.userId, ctx.query.teamId);
      },
    }),

    knowledgeReadRouteDef({
      method: 'POST',
      path: '/internal/retrieval/search',
      schema: searchSchema,
      handler: async (ctx, deps) => {
        return deps.search({
          query: ctx.body.query,
          ...(ctx.body.teamId !== undefined ? { teamId: ctx.body.teamId } : {}),
          ...(ctx.body.limit !== undefined ? { limit: ctx.body.limit } : {}),
        });
      },
    }),

    knowledgeReadRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async () => ({ status: 'ok', service: 'knowledge-read' }),
    }),

    knowledgeReadRouteDef({
      method: 'GET',
      path: '/internal/knowledge-read/projection-status',
      schema: healthSchema,
      handler: async (_ctx, deps) => {
        return deps.getProjectionStatus();
      },
    }),

    knowledgeReadRouteDef({
      method: 'POST',
      path: '/internal/knowledge-read/projection-rebuild',
      schema: healthSchema,
      successStatus: 202,
      handler: async (_ctx, deps) => {
        if (!deps.rebuildProjection) {
          return routeResponse(501, {
            error: 'Projection rebuild is not configured for this knowledge-read host',
            kind: 'not-implemented',
          });
        }
        return deps.rebuildProjection();
      },
    }),
  ];
}

/**
 * Fastify-plugin compatibility shim: registers the knowledge-read RouteDefs
 * onto an existing Fastify instance. Consumed by the host-distributed bridge.
 */
export function registerKnowledgeReadRoutes(app: FastifyInstance, module: KnowledgeReadPort): void {
  registerFastifyRoutes(app, createKnowledgeReadRouteDefs(module), module);
}
