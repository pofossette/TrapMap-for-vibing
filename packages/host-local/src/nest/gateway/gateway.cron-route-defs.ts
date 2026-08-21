/**
 * Cron management surface as session-guarded `/v1/cron/*` gateway routes.
 *
 * The monolith serves the cron bounded context over the cron service module
 * port — the service package's own RouteDefs gate on a client-supplied
 * `x-trapmap-actor-id` which the monolith cannot verify, so they are not
 * mounted on the public port (mirrors the distributed gateway).
 */

import { InvocationError } from '@trapmap/backend-core';
import type { RouteDef } from '@trapmap/backend-core';
import { cronJobCreateInputSchema, cronJobUpdateInputSchema } from '@trapmap/contracts';
import { z } from 'zod';

import {
  type GatewayRouteDeps,
  authContextSchema,
  emptyRecord,
  gatewayRouteDef,
} from './gateway.route-kit.js';

const cronJobListSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
  authContext: authContextSchema,
});

const cronJobParamsSchema = z.object({
  params: z.object({ jobId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
  authContext: authContextSchema,
});

const cronJobCreateSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: cronJobCreateInputSchema,
  authContext: authContextSchema,
});

const cronJobUpdateSchema = z.object({
  params: z.object({ jobId: z.string() }),
  query: emptyRecord,
  body: cronJobUpdateInputSchema,
  authContext: authContextSchema,
});

export function createCronGatewayRouteDefs(_deps: GatewayRouteDeps): RouteDef[] {
  return [
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/jobs',
      schema: cronJobListSchema,
      handler: async (_ctx, deps) => {
        return deps.cron.list();
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/cron/jobs',
      schema: cronJobCreateSchema,
      successStatus: 201,
      handler: async (ctx, deps) => {
        return deps.cron.create(ctx.body);
      },
    }),

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobParamsSchema,
      handler: async (ctx, deps) => {
        const job = await deps.cron.getById(ctx.params.jobId);
        if (!job) {
          throw InvocationError.notFound('Cron job not found');
        }
        return job;
      },
    }),

    gatewayRouteDef({
      method: 'PATCH',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobUpdateSchema,
      handler: async (ctx, deps) => {
        const job = await deps.cron.update(ctx.params.jobId, ctx.body);
        if (!job) {
          throw InvocationError.notFound('Cron job not found');
        }
        return job;
      },
    }),

    gatewayRouteDef({
      method: 'DELETE',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobParamsSchema,
      handler: async (ctx, deps) => {
        const deleted = await deps.cron.delete(ctx.params.jobId);
        if (!deleted) {
          throw InvocationError.notFound('Cron job not found');
        }
        return { ok: true };
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/cron/jobs/:jobId/trigger',
      schema: cronJobParamsSchema,
      handler: async (ctx, deps) => {
        return deps.cron.trigger(ctx.params.jobId);
      },
    }),

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/status',
      schema: cronJobListSchema,
      handler: async (_ctx, deps) => {
        return deps.cron.statusSnapshots();
      },
    }),
  ];
}
