import { InvocationError } from '@trapmap/backend-core';
import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { governanceRouteDef, reviewCommandArgs, maintenanceCommandArgs } from './helpers.js';
import type { GovernanceReviewRouteDeps } from './helpers.js';
import {
  reviewCommandSchema,
  maintenanceCommandSchema,
  conflictDetectSchema,
  reviewArtifactSchema,
} from './helpers.js';

export function createGovernanceMaintenanceRouteDefs(): RouteDef<RouteContext, GovernanceReviewRouteDeps>[] {
  return [
    governanceRouteDef({ method: 'POST', path: '/internal/review/approve', schema: reviewCommandSchema, handler: (ctx, m) => (m as unknown as Record<string, (a:unknown)=>Promise<unknown>>).approve(reviewCommandArgs(ctx)) }),
    governanceRouteDef({ method: 'POST', path: '/internal/review/reject', schema: reviewCommandSchema, handler: (ctx, m) => (m as unknown as Record<string, (a:unknown)=>Promise<unknown>>).reject(reviewCommandArgs(ctx)) }),
    governanceRouteDef({ method: 'POST', path: '/internal/review/return-for-correction', schema: reviewCommandSchema, handler: (ctx, m) => (m as unknown as Record<string, (a:unknown)=>Promise<unknown>>).returnForCorrection(reviewCommandArgs(ctx)) }),
    governanceRouteDef({ method: 'POST', path: '/internal/review/maintenance', schema: maintenanceCommandSchema, handler: (ctx, m) => (m as unknown as Record<string, (a:unknown)=>Promise<unknown>>).applyMaintenance(maintenanceCommandArgs(ctx)) }),
    governanceRouteDef({ method: 'POST', path: '/internal/review/decay', schema: maintenanceCommandSchema, handler: (ctx, m) => (m as unknown as Record<string, (a:unknown)=>Promise<unknown>>).applyDecay(maintenanceCommandArgs(ctx)) }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/conflicts/detect',
      schema: conflictDetectSchema,
      handler: async (ctx, module) => {
        const wf = (module as unknown as Record<string, unknown>).conflictWorkflow as { detectConflicts: (a: unknown)=>Promise<unknown> } | undefined;
        if (!wf) throw InvocationError.unavailable('Conflict workflow unavailable');
        return wf.detectConflicts({ entryId: (ctx.body as { entryId: string }).entryId });
      },
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/artifact',
      schema: reviewArtifactSchema,
      handler: async (ctx, module) => {
        await (module as unknown as Record<string, (a:string,b:string,c:string,d?:string)=>Promise<void>>).reviewArtifact((ctx.body as { artifactId: string }).artifactId, (ctx.body as { decision: string }).decision, (ctx.body as { actorId: string }).actorId, (ctx.body as { note?: string }).note);
        return { ok: true };
      },
    }),
  ];
}
