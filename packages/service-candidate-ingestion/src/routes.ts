import type { CandidateIngestionPort } from '@trapmap/backend-core';
import {
  InvocationError,
  type RouteContext,
  type RouteDef,
  type RouteSuccess,
  isRouteResponse,
  registerFastifyRoutes,
  routeResponse,
} from '@trapmap/backend-core';
import type { CandidateStatus } from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());

const submitSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

const candidateParamsSchema = z.object({
  params: z.object({ candidateId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const listSchema = z.object({
  params: emptyRecord,
  query: z.object({ status: z.string().optional() }),
  body: z.unknown(),
});

const mutationSchema = z.object({
  params: z.object({ candidateId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

function trustedActor(headers: Record<string, unknown>, body: unknown): string | RouteSuccess {
  const actorId = headers['x-trapmap-actor-id'];
  if (typeof actorId !== 'string' || !actorId) {
    return routeResponse(401, { error: 'Trusted actor is required', kind: 'forbidden' });
  }
  const bodyActorId =
    typeof body === 'object' && body !== null ? (body as { actorId?: unknown }).actorId : undefined;
  if (typeof bodyActorId === 'string' && bodyActorId !== actorId) {
    return routeResponse(403, {
      error: 'Actor does not match trusted identity',
      kind: 'forbidden',
    });
  }
  return actorId;
}

/**
 * Preserves the legacy wire quirk: `unauthorized` InvocationErrors from the
 * module surface as HTTP 500 (kind `unauthorized` kept in the body) rather
 * than the canonical 401 mapping.
 */
async function invokeCandidate<T>(operation: () => Promise<T>): Promise<T | RouteSuccess> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof InvocationError && error.kind === 'unauthorized') {
      return routeResponse(500, { error: error.message, kind: error.kind });
    }
    throw error;
  }
}

function candidateRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: CandidateIngestionPort): Promise<unknown>;
}): RouteDef<Ctx, CandidateIngestionPort> {
  return def;
}

export function createCandidateIngestionRouteDefs(
  _module: CandidateIngestionPort,
): RouteDef<RouteContext, CandidateIngestionPort>[] {
  return [
    candidateRouteDef({
      method: 'POST',
      path: '/internal/candidates',
      schema: submitSchema,
      successStatus: 201,
      handler: async (ctx, deps) => {
        const body = ctx.body as Parameters<CandidateIngestionPort['submit']>[0];
        return invokeCandidate(() => deps.submit(body));
      },
    }),

    candidateRouteDef({
      method: 'GET',
      path: '/internal/candidates/:candidateId',
      schema: candidateParamsSchema,
      handler: async (ctx, deps) => {
        return invokeCandidate(async () => {
          const result = await deps.getById(ctx.params.candidateId);
          if (!result) throw InvocationError.notFound('Candidate not found');
          return result;
        });
      },
    }),

    candidateRouteDef({
      method: 'GET',
      path: '/internal/candidates',
      schema: listSchema,
      handler: async (ctx, deps) => {
        return invokeCandidate(() =>
          deps.listByStatus((ctx.query.status ?? 'received') as CandidateStatus),
        );
      },
    }),

    candidateRouteDef({
      method: 'POST',
      path: '/internal/candidates/:candidateId/resolution',
      schema: mutationSchema,
      handler: async (ctx, deps) => {
        const actor = trustedActor(ctx.headers ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const body = ctx.body as {
          actorId?: unknown;
          resolution?: Record<string, unknown>;
        } | null;
        return invokeCandidate(() =>
          deps.applyResolution(ctx.params.candidateId, body!.resolution!, actor).then(() => ({
            ok: true,
          })),
        );
      },
    }),

    candidateRouteDef({
      method: 'POST',
      path: '/internal/candidates/:candidateId/manual-result',
      schema: mutationSchema,
      handler: async (ctx, deps) => {
        const actor = trustedActor(ctx.headers ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const body = ctx.body as {
          actorId?: unknown;
          result?: Record<string, unknown>;
        } | null;
        return invokeCandidate(() =>
          deps.submitManualResult(ctx.params.candidateId, body!.result!, actor).then(() => ({
            ok: true,
          })),
        );
      },
    }),

    candidateRouteDef({
      method: 'POST',
      path: '/internal/candidates/:candidateId/publish',
      schema: mutationSchema,
      handler: async (ctx, deps) => {
        const actor = trustedActor(ctx.headers ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const body = ctx.body as { result: Record<string, unknown>; actorId?: unknown } | null;
        return invokeCandidate(() =>
          deps.publishCandidateResult(ctx.params.candidateId, body!.result, actor),
        );
      },
    }),

    candidateRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async () => ({ status: 'ok', service: 'candidate-ingestion' }),
    }),
  ];
}

/**
 * Fastify-plugin compatibility shim: registers the candidate-ingestion
 * RouteDefs onto an existing Fastify instance. Consumed by the
 * host-distributed bridge.
 */
export function registerCandidateIngestionRoutes(
  app: FastifyInstance,
  module: CandidateIngestionPort,
): void {
  registerFastifyRoutes(app, createCandidateIngestionRouteDefs(module), module);
}
