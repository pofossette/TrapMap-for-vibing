import type { RouteDef } from '@trapmap/backend-core';
import {
  actorHeadersSchema,
  cronCreateJobSchema,
  cronJobParamsSchema,
  forward,
  gatewayRouteDef,
  requireTrustedActor,
  trustedActorOptions,
} from './shared.js';

export function createCronRoutes(): RouteDef[] {
  return [
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/jobs',
      schema: actorHeadersSchema,
      handler: async (_ctx, clients) => {
        return forward(clients.cronScheduler.listJobs());
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/cron/jobs',
      schema: cronCreateJobSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(clients.cronScheduler.createJob(trusted.body, trustedActorOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobParamsSchema,
      handler: async (ctx, clients) => {
        return forward(clients.cronScheduler.getJob(ctx.params.jobId));
      },
    }),
    gatewayRouteDef({
      method: 'PATCH',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobParamsSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.cronScheduler.updateJob(ctx.params.jobId, trusted.body, trustedActorOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'DELETE',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobParamsSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(clients.cronScheduler.deleteJob(ctx.params.jobId, trustedActorOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/cron/jobs/:jobId/trigger',
      schema: cronJobParamsSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.cronScheduler.triggerJob(ctx.params.jobId, trustedActorOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/status',
      schema: actorHeadersSchema,
      handler: async (_ctx, clients) => {
        return forward(clients.cronScheduler.getStatus());
      },
    }),
  ];
}
