import type { RouteDef } from '@trapmap/backend-core';
import { routeResponse } from '@trapmap/backend-core';
import { z } from 'zod';
import {
  emptyRecord,
  forward,
  gatewayRouteDef,
  jobParamsSchema,
  scheduleJobSchema,
} from './shared.js';

export function createJobRoutes(): RouteDef[] {
  return [
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/jobs',
      schema: scheduleJobSchema,
      handler: async (ctx, clients) => {
        return forward(
          clients.jobRuntime.schedule({
            type: ctx.body.type,
            payload: ctx.body.payload,
            ...(ctx.body.delayMs !== undefined ? { delayMs: ctx.body.delayMs } : {}),
            ...(ctx.body.priority !== undefined ? { priority: ctx.body.priority } : {}),
            ...(ctx.body.maxAttempts !== undefined ? { maxAttempts: ctx.body.maxAttempts } : {}),
            ...(ctx.body.dedupeKey !== undefined ? { dedupeKey: ctx.body.dedupeKey } : {}),
          }),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/jobs/:jobId',
      schema: jobParamsSchema,
      handler: async (ctx, clients) => {
        return forward(clients.jobRuntime.getStatus(ctx.params.jobId));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/jobs/queue',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        body: z.unknown(),
      }),
      handler: async (_ctx, clients) => {
        return forward(clients.jobRuntime.getQueueStatus());
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/operations/status/async',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        body: z.unknown(),
      }),
      handler: async (_ctx, clients) => {
        const result = await clients.jobRuntime.getQueueStatus();
        if (
          result.status < 200 ||
          result.status >= 300 ||
          !result.body ||
          typeof result.body !== 'object'
        ) {
          return routeResponse(result.status, result.body);
        }
        const queue = result.body as Record<string, unknown>;
        return routeResponse(200, {
          asyncRuntimeEnabled: true,
          deploymentProfile: 'distributed',
          routeSurface: 'gateway-core',
          asyncOwnershipExpectation: 'remote-expected',
          queue: {
            ...queue,
            reclaimCount: 0,
            recentDeadLetters: [],
            staleRunning: 0,
          },
          outbox: {
            pending: 0,
            processing: 0,
            failed: 0,
            staleProcessing: 0,
            reclaimCount: 0,
            recentFailures: [],
          },
          retryResumeContract: { deadLetterPolicy: 'job-runtime owned' },
        });
      },
    }),
  ];
}
