/**
 * Cron service RouteDefs — management + status surface.
 *
 * CRUD/trigger/status routes are thin passthroughs over the injected
 * CronServiceModule; mutations require a trusted actor header
 * (`x-trapmap-actor-id`) so host gateways can gate the scheduler's registry
 * surface, mirroring the other service packages.
 */

import type { RouteContext, RouteDef, RouteSuccess } from '@trapmap/backend-core';
import {
  createServiceReadinessHandler,
  InvocationError,
  isRouteResponse,
  routeResponse,
} from '@trapmap/backend-core';
import { cronJobCreateInputSchema, cronJobUpdateInputSchema } from '@trapmap/contracts';
import { type ZodType, z } from 'zod';
import type { CronServiceModule } from './deps.js';

export type CronRouteDeps = CronServiceModule & {
  checkDependency?: () => Promise<{ reachable: boolean; detail?: string }>;
};

const CRON_OWNERSHIP = {
  service: 'cron',
  boundedContext: 'cron-scheduler',
  dataOwner: ['cron-jobs'],
  projectionOwner: [],
  doesNotOwn: ['task-queue', 'domain-event-outbox'],
  syncBoundary:
    'cron owns the cron job registry and schedule state; it never executes task business logic synchronously.',
  asyncBoundary:
    'Due cron jobs are enqueued into the async task queue as follow-up work; retries, dead-lettering and execution leases belong to job-runtime.',
  commandSurface: ['create', 'update', 'pause', 'resume', 'trigger', 'delete'],
  delegateTo: 'job-runtime',
} as const;

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());
const jobParamsSchema = z.object({ id: z.string().min(1) });

const jobListSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

const jobCreateSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: cronJobCreateInputSchema,
});

const jobGetSchema = z.object({
  params: jobParamsSchema,
  query: emptyRecord,
  body: z.unknown(),
});

const jobUpdateSchema = z.object({
  params: jobParamsSchema,
  query: emptyRecord,
  headers: headersSchema,
  body: cronJobUpdateInputSchema,
});

const jobMutationSchema = z.object({
  params: jobParamsSchema,
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

function trustedActor(headers: Record<string, unknown> | undefined): string | RouteSuccess {
  const actorId = headers?.['x-trapmap-actor-id'];
  if (typeof actorId !== 'string' || actorId.length === 0) {
    return routeResponse(401, { error: 'Missing authenticated actor', kind: 'auth' });
  }
  return actorId;
}

function withTrustedActor<T>(
  ctx: RouteContext,
  run: (actorId: string) => Promise<T> | T,
): Promise<T | RouteSuccess> {
  const actor = trustedActor(ctx.headers);
  if (isRouteResponse(actor)) return Promise.resolve(actor);
  return Promise.resolve(run(actor));
}

function requireJob<T>(job: T | null, message = 'Cron job not found'): T {
  if (job === null) throw InvocationError.notFound(message);
  return job;
}

function readinessHandler(deps: CronRouteDeps) {
  return createServiceReadinessHandler({
    service: 'cron',
    checkDependency: deps.checkDependency,
    checks: {
      'job-registry': { status: 'ok', detail: null },
    },
    extra: {
      executionModel: 'enqueue-to-task-queue',
    },
  });
}

function cronRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: CronRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, CronRouteDeps> {
  return def;
}

export function createCronRouteDefs(_deps: CronRouteDeps): RouteDef<RouteContext, CronRouteDeps>[] {
  return [
    cronRouteDef({
      method: 'GET',
      path: '/cron/jobs',
      schema: jobListSchema,
      handler: (_ctx, module) => module.list(),
    }),

    cronRouteDef({
      method: 'POST',
      path: '/cron/jobs',
      schema: jobCreateSchema,
      successStatus: 201,
      handler: (ctx, module) => withTrustedActor(ctx, () => module.create(ctx.body)),
    }),

    cronRouteDef({
      method: 'GET',
      path: '/cron/jobs/:id',
      schema: jobGetSchema,
      handler: async (ctx, module) => requireJob(await module.getById(ctx.params.id)),
    }),

    cronRouteDef({
      method: 'PATCH',
      path: '/cron/jobs/:id',
      schema: jobUpdateSchema,
      handler: async (ctx, module) =>
        withTrustedActor(ctx, async () => requireJob(await module.update(ctx.params.id, ctx.body))),
    }),

    cronRouteDef({
      method: 'DELETE',
      path: '/cron/jobs/:id',
      schema: jobMutationSchema,
      handler: async (ctx, module) =>
        withTrustedActor(ctx, async () => {
          const deleted = await module.delete(ctx.params.id);
          if (!deleted) throw InvocationError.notFound('Cron job not found');
          return { ok: true };
        }),
    }),

    cronRouteDef({
      method: 'POST',
      path: '/cron/jobs/:id/trigger',
      schema: jobMutationSchema,
      handler: (ctx, module) => withTrustedActor(ctx, () => module.trigger(ctx.params.id)),
    }),

    cronRouteDef({
      method: 'GET',
      path: '/cron/status',
      schema: healthSchema,
      handler: (_ctx, module) => module.statusSnapshots(),
    }),

    cronRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async () => ({
        status: 'ok',
        service: 'cron',
        owner: CRON_OWNERSHIP.boundedContext,
        delegateTo: CRON_OWNERSHIP.delegateTo,
      }),
    }),

    cronRouteDef({
      method: 'GET',
      path: '/internal/live',
      schema: healthSchema,
      handler: async () => ({ status: 'alive', service: 'cron' }),
    }),

    cronRouteDef({
      method: 'GET',
      path: '/internal/readiness',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module)(),
    }),

    cronRouteDef({
      method: 'GET',
      path: '/internal/ready',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module)(),
    }),

    cronRouteDef({
      method: 'GET',
      path: '/internal/ownership',
      schema: healthSchema,
      handler: async () => CRON_OWNERSHIP,
    }),

    cronRouteDef({
      method: 'GET',
      path: '/internal/operator-status',
      schema: healthSchema,
      handler: async (_ctx, module) => {
        try {
          const details = (await module.checkDependency?.()) ?? {};
          return {
            service: 'cron',
            owner: CRON_OWNERSHIP.boundedContext,
            scheduler: {
              running: module.scheduler.isRunning(),
              ownsWork: module.scheduler.ownsWork(),
            },
            ...details,
          };
        } catch (error) {
          return routeResponse(503, {
            service: 'cron',
            owner: CRON_OWNERSHIP.boundedContext,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
  ];
}
