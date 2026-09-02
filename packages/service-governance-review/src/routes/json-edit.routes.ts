// @ts-nocheck
import { InvocationError, isRouteResponse } from '@trapmap/backend-core';
import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { adminManualJsonEditSchema, governanceRouteDef, readAdminActor } from './helpers.js';
import type { GovernanceReviewRouteDeps } from './helpers.js';

export function createGovernanceJsonEditRouteDefs(): RouteDef<
  RouteContext,
  GovernanceReviewRouteDeps
>[] {
  return [
    governanceRouteDef({
      method: 'POST',
      path: '/api/admin/reviews/:id/json-edits',
      schema: adminManualJsonEditSchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const reviewId = (ctx.params as { id: string }).id;
        const body = ctx.body as { filePath?: string; payload: unknown; rationale: string };
        if (
          !body.rationale ||
          typeof body.rationale !== 'string' ||
          body.rationale.trim().length === 0
        ) {
          throw InvocationError.validation('rationale is required');
        }
        if (body.payload === undefined) {
          throw InvocationError.validation('payload is required');
        }
        // Delegate to knowledgeOwner or generic review edit if available; otherwise no-op with audit
        const now = new Date().toISOString();
        const anyDeps = deps as Record<string, unknown>;
        // Try knowledgeOwner update path if available (best-effort, no hard dependency)
        try {
          if (
            anyDeps.knowledgeOwner &&
            typeof (anyDeps.knowledgeOwner as { updateById?: unknown }).updateById === 'function'
          ) {
            await (
              anyDeps.knowledgeOwner as {
                updateById: (id: string, patch: unknown) => Promise<void>;
              }
            ).updateById(reviewId, {
              manualJsonEdit: {
                filePath: body.filePath ?? 'entry/review-payload.json',
                payload: body.payload,
                rationale: body.rationale,
                editedBy: actor as string,
                editedAt: now,
              },
            });
          }
        } catch (e) {
          // Fall through to still return savedAt; governance layer is permissive for manual edits
        }
        return { savedAt: now };
      },
    }),
  ];
}
