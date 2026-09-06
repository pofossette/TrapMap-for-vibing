// @ts-nocheck

import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { InvocationError, routeResponse } from '@trapmap/backend-core';
import type { GovernanceReviewRouteDeps } from './helpers.js';
import {
  badcaseExportDraftSchema,
  feedbackAdminBatchSchema,
  feedbackAdminListSchema,
  feedbackAdminStatsSchema,
  feedbackSchema,
  governanceRouteDef,
  remediationReactivationSchema,
  retrievalProjectionSchema,
  withAdminActor,
} from './helpers.js';

export function createGovernanceFeedbackRouteDefs(): RouteDef<
  RouteContext,
  GovernanceReviewRouteDeps
>[] {
  return [
    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback',
      schema: feedbackSchema,
      successStatus: 201,
      handler: async (ctx, module) => {
        const requestActorId = (ctx.headers as Record<string, unknown>)?.['x-trapmap-actor-id'];
        if (typeof requestActorId !== 'string' || requestActorId.length === 0)
          return routeResponse(401, { error: 'Missing authenticated actor', kind: 'auth' });
        const body = ctx.body as Record<string, unknown>;
        if (body.actorId !== undefined && body.actorId !== requestActorId)
          throw InvocationError.forbidden('Body actor does not match authenticated actor');
        return module.submitFeedback({ ...(body as object), actorId: requestActorId as string });
      },
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/async/remediation-reactivation',
      schema: remediationReactivationSchema,
      handler: async (ctx, module) => {
        if (!module.asyncCommands)
          throw InvocationError.unavailable('Governance async commands unavailable');
        await module.asyncCommands.reactivateRemediation(ctx.body);
        return { ok: true };
      },
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/async/badcase-export-draft',
      schema: badcaseExportDraftSchema,
      handler: async (ctx, module) => {
        if (!module.asyncCommands)
          throw InvocationError.unavailable('Governance async commands unavailable');
        await module.asyncCommands.exportBadcaseDraft(ctx.body);
        return { ok: true };
      },
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/governance-review/retrieval-projection',
      schema: retrievalProjectionSchema,
      handler: async (ctx, module) => {
        const proj = module.governanceRetrievalProjection;
        if (!proj) throw InvocationError.unavailable('Governance retrieval projection unavailable');
        const [feedback, conflicts] = await Promise.all([
          proj.listFeedback(),
          proj.listConflicts((ctx.body as { entryIds: string[] }).entryIds),
        ]);
        return { feedback, conflicts };
      },
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin',
      schema: feedbackAdminListSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx as RouteContext, (admin, actor) =>
          (admin as { list: (a: unknown) => Promise<unknown> }).list({
            actorId: actor,
            query: ctx.query,
          }),
        ),
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/admin/batch',
      schema: feedbackAdminBatchSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx as RouteContext, (admin, actor) =>
          (admin as { batch: (a: unknown) => Promise<unknown> }).batch({
            actorId: actor,
            command: ctx.body,
          }),
        ),
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin/stats/:entryId',
      schema: feedbackAdminStatsSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx as RouteContext, (admin, actor) =>
          (admin as { stats: (a: unknown) => Promise<unknown> }).stats({
            actorId: actor,
            entryId: (ctx.params as { entryId: string }).entryId,
          }),
        ),
    }),
  ];
}
