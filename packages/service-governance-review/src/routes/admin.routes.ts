// @ts-nocheck

import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { InvocationError, isRouteResponse, routeResponse } from '@trapmap/backend-core';
import { z } from 'zod';
import type { GovernanceReviewRouteDeps } from './helpers.js';
import {
  feedbackAdminRemediationCompleteSchema,
  GOVERNANCE_REVIEW_OWNERSHIP,
  governanceRouteDef,
  healthSchema,
  readAdminActor,
  readinessHandler,
} from './helpers.js';

const emptyRecord = z.record(z.string(), z.unknown());

export function createGovernanceAdminRouteDefs(): RouteDef<
  RouteContext,
  GovernanceReviewRouteDeps
>[] {
  return [
    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin/remediation',
      schema: z.object({
        params: emptyRecord,
        query: z.object({ limit: z.coerce.number().optional(), cursor: z.string().optional() }),
        body: z.unknown(),
        headers: z.record(z.string(), z.unknown()).optional(),
      }),
      handler: (ctx, module) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const admin = (module as unknown as Record<string, unknown>).admin as
          | { listRemediation?: (a: unknown) => Promise<unknown> }
          | undefined;
        if (!admin?.listRemediation) throw InvocationError.unavailable('Admin unavailable');
        return admin.listRemediation({ actorId: actor as string, query: ctx.query });
      },
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin/remediation/:entryId',
      schema: z.object({
        params: z.object({ entryId: z.string() }),
        query: emptyRecord,
        body: z.unknown(),
        headers: z.record(z.string(), z.unknown()).optional(),
      }),
      handler: (ctx, module) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const admin = (module as unknown as Record<string, unknown>).admin as
          | { getRemediation?: (a: unknown) => Promise<unknown> }
          | undefined;
        if (!admin?.getRemediation) throw InvocationError.unavailable('Admin unavailable');
        return admin.getRemediation({
          actorId: actor as string,
          entryId: (ctx.params as { entryId: string }).entryId,
        });
      },
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/admin/remediation/:entryId/complete',
      schema: feedbackAdminRemediationCompleteSchema,
      handler: async (ctx, module) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const admin = (module as unknown as Record<string, unknown>).admin as
          | { completeRemediation?: (a: unknown) => Promise<unknown> }
          | undefined;
        if (!admin?.completeRemediation) throw InvocationError.unavailable('Admin unavailable');
        // Original expects { actorId, entryId, command: body } and validates strict: only notes allowed
        const body = ctx.body as Record<string, unknown>;
        // Validate no unexpected keys: only notes/note/evidence? For remediation-complete, only notes allowed
        const allowed = new Set(['notes', 'note', 'evidence']);
        const extra = Object.keys(body).filter((k) => !allowed.has(k));
        if (extra.length > 0) throw InvocationError.validation(`Unexpected key: ${extra[0]}`);
        return admin.completeRemediation({
          actorId: actor as string,
          entryId: (ctx.params as { entryId: string }).entryId,
          command: body,
        });
      },
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async () => ({
        status: 'ok',
        service: 'governance-review',
        owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
        delegateTo: GOVERNANCE_REVIEW_OWNERSHIP.delegateTo,
      }),
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/live',
      schema: healthSchema,
      handler: async () => ({ status: 'alive', service: 'governance-review' }),
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/readiness',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module as GovernanceReviewRouteDeps)(),
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/ready',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module as GovernanceReviewRouteDeps)(),
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/ownership',
      schema: healthSchema,
      handler: async () => GOVERNANCE_REVIEW_OWNERSHIP,
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/operator-status',
      schema: healthSchema,
      handler: async (_ctx, module) => {
        try {
          const details =
            (await (module as unknown as Record<string, unknown>).getOperatorStatus?.call(
              module,
            )) ?? {};
          return {
            service: 'governance-review',
            owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
            ...(details as Record<string, unknown>),
          };
        } catch (error) {
          return routeResponse(503, {
            service: 'governance-review',
            owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),
  ];
}
