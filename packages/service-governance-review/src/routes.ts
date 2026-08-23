import type {
  GovernanceAsyncCommandPort,
  GovernanceConflictWorkflowPort,
  GovernanceRetrievalProjection,
  GovernanceReviewAdminPort,
  ReviewPort,
} from '@trapmap/backend-core';
import {
  InvocationError,
  type RouteContext,
  type RouteDef,
  type RouteSuccess,
  createServiceReadinessHandler,
  isRouteResponse,
  registerFastifyRoutes,
  routeResponse,
} from '@trapmap/backend-core';
import {
  badcaseExportDraftPayloadSchema,
  feedbackBatchRequestSchema,
  feedbackListRequestSchema,
  feedbackRemediationCompleteRequestSchema,
  remediationReactivationPayloadSchema,
} from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';

export type GovernanceReviewRouteModule = ReviewPort & {
  asyncCommands?: GovernanceAsyncCommandPort;
  conflictWorkflow?: GovernanceConflictWorkflowPort;
  admin?: GovernanceReviewAdminPort;
  governanceRetrievalProjection?: GovernanceRetrievalProjection;
};

export interface GovernanceReviewReadinessOptions {
  checkDependency?: () => Promise<{ reachable: boolean; detail?: string }>;
  getOperatorStatus?: () => Promise<Record<string, unknown>>;
}

export type GovernanceReviewRouteDeps = GovernanceReviewRouteModule &
  Partial<GovernanceReviewReadinessOptions>;

const GOVERNANCE_REVIEW_OWNERSHIP = {
  service: 'governance-review',
  boundedContext: 'governance-review',
  dataOwner: [
    'review-queue',
    'feedback-record',
    'remediation-workbench',
    'maintenance-decay-workbench',
    'governance-audit',
  ],
  projectionOwner: [
    'review-queue-projection',
    'feedback-operator-projection',
    'maintenance-decay-operator-projection',
  ],
  doesNotOwn: [
    'knowledge-aggregate-final-mutation',
    'knowledge-lifecycle-authoritative-tables',
    'retrieval-read-projection',
  ],
  syncBoundary:
    'governance-review only owns governance command receipt, eligibility check, flow interpretation, and audit. Final aggregate mutation must be delegated through KnowledgeWritePort.',
  asyncBoundary:
    'Post-approval/rejection/maintenance/decay follow-up actions (projection refresh, artifact follow-up, remediation draft) enter outbox/queue/workflow as async follow-up and never return to the synchronous command path.',
  commandSurface: [
    'approve',
    'reject',
    'returnForCorrection',
    'applyMaintenance',
    'applyDecay',
    'reviewArtifact',
    'submitFeedback',
  ],
  delegateTo: 'knowledge-write',
} as const;

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());

const reviewCommandSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    entryId: z.string(),
    actorId: z.string(),
    note: z.string().optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  }),
});

const maintenanceCommandSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    entryId: z.string(),
    actorId: z.string(),
    action: z.string(),
    note: z.string().optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  }),
});

const conflictDetectSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ entryId: z.string() }),
});

const reviewArtifactSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    artifactId: z.string(),
    decision: z.enum(['approve', 'reject']),
    actorId: z.string(),
    note: z.string().optional(),
  }),
});

const feedbackSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: z
    .object({
      entryId: z.string(),
      problemType: z.string(),
      description: z.string(),
      actorId: z.string().optional(),
    })
    .passthrough(),
});

const remediationReactivationSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: remediationReactivationPayloadSchema,
});

const badcaseExportDraftSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: badcaseExportDraftPayloadSchema,
});

const retrievalProjectionSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ entryIds: z.array(z.string()) }),
});

const feedbackAdminListSchema = z.object({
  params: emptyRecord,
  query: feedbackListRequestSchema,
  headers: headersSchema,
  body: z.unknown(),
});

const feedbackAdminBatchSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: feedbackBatchRequestSchema,
});

const feedbackAdminStatsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

const feedbackAdminRemediationCompleteSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: feedbackRemediationCompleteRequestSchema,
});

const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
});

function reviewCommandArgs(ctx: RouteContext): {
  actorId: string;
  entryId: string;
  evidence?: Record<string, unknown>;
  note?: string;
} {
  const body = ctx.body as {
    actorId: string;
    entryId: string;
    evidence?: Record<string, unknown>;
    note?: string;
  };
  return {
    entryId: body.entryId,
    actorId: body.actorId,
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
  };
}

function maintenanceCommandArgs(ctx: RouteContext): {
  action: string;
  actorId: string;
  entryId: string;
  evidence?: Record<string, unknown>;
  note?: string;
} {
  const body = ctx.body as {
    action: string;
    actorId: string;
    entryId: string;
    evidence?: Record<string, unknown>;
    note?: string;
  };
  return {
    entryId: body.entryId,
    actorId: body.actorId,
    action: body.action,
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
  };
}

function readAdminActor(headers: Record<string, unknown>, body: unknown): string | RouteSuccess {
  const actorId = headers['x-trapmap-actor-id'];
  if (typeof actorId !== 'string' || actorId.length === 0) {
    return routeResponse(401, { error: 'Missing authenticated actor', kind: 'auth' });
  }
  const bodyActorId =
    typeof body === 'object' && body !== null ? (body as { actorId?: unknown }).actorId : undefined;
  if (bodyActorId !== undefined && bodyActorId !== actorId) {
    throw InvocationError.forbidden('Body actor does not match authenticated actor');
  }
  return actorId;
}

function withAdminActor<T>(
  module: GovernanceReviewRouteModule,
  ctx: RouteContext,
  run: (
    admin: NonNullable<GovernanceReviewRouteModule['admin']>,
    actorId: string,
  ) => Promise<T> | T,
): Promise<T | RouteSuccess> {
  const actor = readAdminActor(ctx.headers ?? {}, ctx.body);
  if (isRouteResponse(actor)) return Promise.resolve(actor);
  const admin = module.admin;
  if (!admin) {
    throw InvocationError.unavailable('Feedback admin unavailable');
  }
  return Promise.resolve(run(admin, actor));
}

function readinessHandler(deps: GovernanceReviewRouteDeps) {
  return createServiceReadinessHandler({
    service: 'governance-review',
    checkDependency: deps.checkDependency,
    checks: {
      'delegate-to-knowledge-write': { status: 'ok', detail: null },
    },
    extra: {
      commandSurfaceReceived: true,
      finalAggregateMutation: 'delegated-to-knowledge-write',
      followUpDisposition: 'outbox-queue-workflow-async',
    },
  });
}

function governanceRouteDef<Ctx extends RouteContext>(def: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: GovernanceReviewRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, GovernanceReviewRouteDeps> {
  return def;
}

export function createGovernanceReviewRouteDefs(
  _deps: GovernanceReviewRouteDeps,
): RouteDef<RouteContext, GovernanceReviewRouteDeps>[] {
  return [
    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/approve',
      schema: reviewCommandSchema,
      handler: (ctx, module) => module.approve(reviewCommandArgs(ctx)),
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/reject',
      schema: reviewCommandSchema,
      handler: (ctx, module) => module.reject(reviewCommandArgs(ctx)),
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/return-for-correction',
      schema: reviewCommandSchema,
      handler: (ctx, module) => module.returnForCorrection(reviewCommandArgs(ctx)),
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/maintenance',
      schema: maintenanceCommandSchema,
      handler: (ctx, module) => module.applyMaintenance(maintenanceCommandArgs(ctx)),
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/decay',
      schema: maintenanceCommandSchema,
      handler: (ctx, module) => module.applyDecay(maintenanceCommandArgs(ctx)),
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/conflicts/detect',
      schema: conflictDetectSchema,
      handler: async (ctx, module) => {
        if (!module.conflictWorkflow) {
          throw InvocationError.unavailable('Conflict workflow unavailable');
        }
        return module.conflictWorkflow.detectConflicts({ entryId: ctx.body.entryId });
      },
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/review/artifact',
      schema: reviewArtifactSchema,
      handler: async (ctx, module) => {
        await module.reviewArtifact(
          ctx.body.artifactId,
          ctx.body.decision,
          ctx.body.actorId,
          ctx.body.note,
        );
        return { ok: true };
      },
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback',
      schema: feedbackSchema,
      successStatus: 201,
      handler: async (ctx, module) => {
        const requestActorId = ctx.headers?.['x-trapmap-actor-id'];
        if (typeof requestActorId !== 'string' || requestActorId.length === 0) {
          return routeResponse(401, { error: 'Missing authenticated actor', kind: 'auth' });
        }
        if (ctx.body.actorId !== undefined && ctx.body.actorId !== requestActorId) {
          throw InvocationError.forbidden('Body actor does not match authenticated actor');
        }
        return module.submitFeedback({ ...ctx.body, actorId: requestActorId });
      },
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/async/remediation-reactivation',
      schema: remediationReactivationSchema,
      handler: async (ctx, module) => {
        if (!module.asyncCommands) {
          throw InvocationError.unavailable('Governance async commands unavailable');
        }
        await module.asyncCommands.reactivateRemediation(ctx.body);
        return { ok: true };
      },
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/async/badcase-export-draft',
      schema: badcaseExportDraftSchema,
      handler: async (ctx, module) => {
        if (!module.asyncCommands) {
          throw InvocationError.unavailable('Governance async commands unavailable');
        }
        await module.asyncCommands.exportBadcaseDraft(ctx.body);
        return { ok: true };
      },
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/governance-review/retrieval-projection',
      schema: retrievalProjectionSchema,
      handler: async (ctx, module) => {
        if (!module.governanceRetrievalProjection) {
          throw InvocationError.unavailable('Governance retrieval projection unavailable');
        }
        const [feedback, conflicts] = await Promise.all([
          module.governanceRetrievalProjection.listFeedback(),
          module.governanceRetrievalProjection.listConflicts(ctx.body.entryIds),
        ]);
        return { feedback, conflicts };
      },
    }),

    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin',
      schema: feedbackAdminListSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx, (admin, actor) =>
          admin.list({ actorId: actor, query: ctx.query }),
        ),
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/admin/batch',
      schema: feedbackAdminBatchSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx, (admin, actor) =>
          admin.batch({ actorId: actor, command: ctx.body }),
        ),
    }),

    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin/stats/:entryId',
      schema: feedbackAdminStatsSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx, (admin, actor) =>
          admin.stats({ actorId: actor, entryId: ctx.params.entryId }),
        ),
    }),

    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin/remediation',
      schema: feedbackAdminStatsSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx, (admin, actor) => admin.listRemediation({ actorId: actor })),
    }),

    governanceRouteDef({
      method: 'GET',
      path: '/internal/feedback/admin/remediation/:entryId',
      schema: feedbackAdminStatsSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx, (admin, actor) =>
          admin.getRemediation({ actorId: actor, entryId: ctx.params.entryId }),
        ),
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/internal/feedback/admin/remediation/:entryId/complete',
      schema: feedbackAdminRemediationCompleteSchema,
      handler: (ctx, module) =>
        withAdminActor(module, ctx, (admin, actor) =>
          admin.completeRemediation({
            actorId: actor,
            entryId: ctx.params.entryId,
            command: ctx.body,
          }),
        ),
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
      handler: async (_ctx, module) => readinessHandler(module)(),
    }),

    governanceRouteDef({
      method: 'GET',
      path: '/internal/ready',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module)(),
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
          const details = (await module.getOperatorStatus?.()) ?? {};
          return {
            service: 'governance-review',
            owner: GOVERNANCE_REVIEW_OWNERSHIP.boundedContext,
            ...details,
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

/**
 * Fastify-plugin compatibility shim: registers the governance-review
 * RouteDefs onto an existing Fastify instance. Consumed by the
 * host-distributed bridge.
 */
export function registerGovernanceReviewRoutes(
  app: FastifyInstance,
  module: GovernanceReviewRouteModule,
  options?: GovernanceReviewReadinessOptions,
): void {
  const deps: GovernanceReviewRouteDeps = { ...module, ...options };
  registerFastifyRoutes(app, createGovernanceReviewRouteDefs(deps), deps);
}
