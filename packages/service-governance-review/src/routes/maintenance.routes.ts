// @ts-nocheck

import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core';
import type { GovernanceReviewRouteDeps } from './helpers.js';
import {
  conflictDetectSchema,
  governanceRouteDef,
  maintenanceCommandArgs,
  maintenanceCommandSchema,
  reviewArtifactSchema,
  reviewCommandArgs,
  reviewCommandSchema,
} from './helpers.js';

export function createGovernanceMaintenanceRouteDefs(): RouteDef<
  RouteContext,
  GovernanceReviewRouteDeps
>[] {
  return [
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/approve',
      schema: reviewCommandSchema,
      handler: (ctx, m) => m.approve(reviewCommandArgs(ctx)),
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/reject',
      schema: reviewCommandSchema,
      handler: (ctx, m) => m.reject(reviewCommandArgs(ctx)),
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/return-for-correction',
      schema: reviewCommandSchema,
      handler: (ctx, m) => m.returnForCorrection(reviewCommandArgs(ctx)),
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/maintenance',
      schema: maintenanceCommandSchema,
      handler: (ctx, m) => m.applyMaintenance(maintenanceCommandArgs(ctx)),
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/decay',
      schema: maintenanceCommandSchema,
      handler: (ctx, m) => m.applyDecay(maintenanceCommandArgs(ctx)),
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/conflicts/detect',
      schema: conflictDetectSchema,
      handler: async (ctx, module) => {
        const wf = module.conflictWorkflow;
        if (!wf) throw InvocationError.unavailable('Conflict workflow unavailable');
        return wf.detectConflicts({ entryId: (ctx.body as { entryId: string }).entryId });
      },
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/artifact',
      schema: reviewArtifactSchema,
      handler: async (ctx, module) => {
        await module.reviewArtifact(
          (ctx.body as { artifactId: string }).artifactId,
          (ctx.body as { decision: string }).decision,
          (ctx.body as { actorId: string }).actorId,
          (ctx.body as { note?: string }).note,
        );
        return { ok: true };
      },
    }),
  ];
}
