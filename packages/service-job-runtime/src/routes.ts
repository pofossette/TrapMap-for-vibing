import type { JobRuntimePort } from '@trapmap/backend-core';
import { type RouteContext, type RouteDef, registerFastifyRoutes } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';

const emptyRecord = z.record(z.string(), z.unknown());

const scheduleSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    type: z.string(),
    payload: z.unknown(),
    delayMs: z.number().optional(),
    priority: z.number().optional(),
    maxAttempts: z.number().optional(),
    dedupeKey: z.string().optional(),
  }),
});

const jobParamsSchema = z.object({
  params: z.object({ jobId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

function jobRuntimeRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: JobRuntimePort): Promise<unknown>;
}): RouteDef<Ctx, JobRuntimePort> {
  return def;
}

export function createJobRuntimeRouteDefs(
  _module: JobRuntimePort,
): RouteDef<RouteContext, JobRuntimePort>[] {
  return [
    jobRuntimeRouteDef({
      method: 'POST',
      path: '/internal/jobs',
      schema: scheduleSchema,
      successStatus: 201,
      handler: async (ctx, deps) => {
        const jobId = await deps.schedule(ctx.body.type, ctx.body.payload, {
          ...(ctx.body.delayMs !== undefined ? { delayMs: ctx.body.delayMs } : {}),
          ...(ctx.body.priority !== undefined ? { priority: ctx.body.priority } : {}),
          ...(ctx.body.maxAttempts !== undefined ? { maxAttempts: ctx.body.maxAttempts } : {}),
          ...(ctx.body.dedupeKey !== undefined ? { dedupeKey: ctx.body.dedupeKey } : {}),
        });
        return { jobId };
      },
    }),

    jobRuntimeRouteDef({
      method: 'GET',
      path: '/internal/jobs/:jobId',
      schema: jobParamsSchema,
      handler: async (ctx, deps) => {
        return deps.getStatus(ctx.params.jobId);
      },
    }),

    jobRuntimeRouteDef({
      method: 'GET',
      path: '/internal/jobs/queue',
      schema: healthSchema,
      handler: async (_ctx, deps) => {
        return deps.getQueueStatus();
      },
    }),

    jobRuntimeRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async () => ({ status: 'ok', service: 'job-runtime' }),
    }),
  ];
}

/**
 * Fastify-plugin compatibility shim: registers the job-runtime RouteDefs onto
 * an existing Fastify instance. Consumed by the host-distributed bridge.
 */
export function registerJobRuntimeRoutes(app: FastifyInstance, module: JobRuntimePort): void {
  registerFastifyRoutes(app, createJobRuntimeRouteDefs(module), module);
}
