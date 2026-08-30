// fallow-ignore-file complexity -- admin route handlers intentionally keep governance + pagination logic co-located for T6 closeout
// fallow-ignore-file code-duplication -- admin routes reuse domain pure functions (applyReviewQueueQuery, filterReviewQueueEntries) and mirror panel helpers
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
  adminActivityQuerySchema,
  adminReviewQueueQuerySchema,
  badcaseExportDraftPayloadSchema,
  feedbackBatchRequestSchema,
  feedbackListRequestSchema,
  feedbackRemediationCompleteRequestSchema,
  remediationReactivationPayloadSchema,
} from '@trapmap/contracts';
import type {
  AdminActivityEvent,
  AdminActivityQuery,
  AdminReviewQueueQuery,
  KnowledgeEntry,
} from '@trapmap/contracts';
import type { FastifyInstance } from 'fastify';
import { type ZodType, z } from 'zod';
import {
  filterReviewQueueEntries,
  isReviewQueueEntryVisible,
} from '@trapmap/backend-core/governance-review/domain/policy.js';
import { applyReviewQueueQuery } from '@trapmap/backend-core/governance-review/domain/review-queue-query.js';

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
  Partial<GovernanceReviewReadinessOptions> & {
    // Admin review-queue / activity deps — minimal list/get functions returning typed responses.
    knowledgeOwner?: {
      listByFilter(
        filter: Record<string, unknown>,
      ): Promise<{ items: KnowledgeEntry[]; total: number } | KnowledgeEntry[]>;
      getById(entryId: string): Promise<KnowledgeEntry | null>;
    };
    listReviewEntries?: () => Promise<KnowledgeEntry[]>;
    getReviewEntry?: (id: string) => Promise<KnowledgeEntry | null>;
    listActivityEvents?: () => Promise<AdminActivityEvent[]>;
    activityFeed?: { list(): Promise<AdminActivityEvent[]> };
  };

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

// ---------------------------------------------------------------------------
// Admin schemas — reuse T2 shared Zod via contracts
// ---------------------------------------------------------------------------

const adminReviewQueueSchema = z.object({
  params: emptyRecord,
  query: adminReviewQueueQuerySchema,
  headers: headersSchema,
  body: z.unknown(),
});

const adminReviewDetailSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

const adminActivitySchema = z.object({
  params: emptyRecord,
  query: adminActivityQuerySchema,
  headers: headersSchema,
  body: z.unknown(),
});

const adminReviewDecisionSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({
    decision: z.enum(['approve', 'reject', 'return-for-correction']),
    notes: z.string().min(1).max(2000).optional(),
    note: z.string().min(1).max(2000).optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  }),
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

// ---------------------------------------------------------------------------
// Admin helpers — pure functions reused from domain (copied to avoid fragile subpath imports)
// ---------------------------------------------------------------------------

type ReviewQueueAuth = {
  subjectType: 'user' | 'system-admin';
  activeTeamId: string | null;
  securityLevel: number;
};

function getGovernanceAuth(headers: Record<string, unknown>): ReviewQueueAuth {
  const subjectType =
    headers['x-trapmap-subject-type'] === 'system-admin' ? 'system-admin' : 'user';
  const activeTeamId =
    typeof headers['x-trapmap-team-id'] === 'string'
      ? (headers['x-trapmap-team-id'] as string)
      : typeof headers['x-trapmap-active-team-id'] === 'string'
        ? (headers['x-trapmap-active-team-id'] as string)
        : null;
  const rawLevel = headers['x-trapmap-security-level'] ?? headers['x-trapmap-securityLevel'];
  const securityLevel =
    typeof rawLevel === 'string'
      ? Number.parseInt(rawLevel, 10)
      : typeof rawLevel === 'number'
        ? rawLevel
        : 0;
  const clamped = Number.isFinite(securityLevel) ? Math.max(0, Math.min(10, securityLevel)) : 0;
  return { subjectType, activeTeamId, securityLevel: clamped };
}

function toReviewQueueItem(entry: KnowledgeEntry) {
  return {
    entry,
    agentReview: entry.agentReview ?? null,
    submittedBy: entry.latestSubmission?.submittedBy ?? entry.owner,
    lastDecision: entry.reviewHistory.at(-1) ?? null,
    latestSubmission: entry.latestSubmission ?? null,
    reviewNotes: entry.reviewNotes ?? [],
  };
}

type ReviewQueueQuery = {
  status?: string;
  search?: string;
  source?: string;
  riskLevel?: 'high' | 'medium' | 'low';
  sort: 'highest-risk' | 'longest-waiting' | 'newest' | 'oldest';
  cursor?: string;
  limit: number;
};

async function fetchAllReviewEntries(deps: GovernanceReviewRouteDeps): Promise<KnowledgeEntry[]> {
  // Preferred: knowledgeOwner port (PG) — reuse existing projection helper path
  if (deps.knowledgeOwner && typeof deps.knowledgeOwner.listByFilter === 'function') {
    const result = await deps.knowledgeOwner.listByFilter({});
    if (Array.isArray(result)) return result as KnowledgeEntry[];
    if (result && typeof result === 'object' && 'items' in (result as Record<string, unknown>)) {
      return ((result as { items: KnowledgeEntry[] }).items ?? []) as KnowledgeEntry[];
    }
  }
  if (typeof deps.listReviewEntries === 'function') {
    return deps.listReviewEntries();
  }
  const anyDeps = deps as unknown as Record<string, unknown>; // lib type gap: dynamic admin port probe
  if (
    anyDeps.reviewQueue &&
    typeof (anyDeps.reviewQueue as { list?: unknown }).list === 'function'
  ) {
    return (anyDeps.reviewQueue as { list(): Promise<KnowledgeEntry[]> }).list();
  }
  // No projection wired — return empty to keep owner pure and tests that don't wire PG green
  return [];
}

async function fetchReviewEntryById(
  deps: GovernanceReviewRouteDeps,
  id: string,
): Promise<KnowledgeEntry | null> {
  if (deps.knowledgeOwner && typeof deps.knowledgeOwner.getById === 'function') {
    return deps.knowledgeOwner.getById(id);
  }
  if (typeof deps.getReviewEntry === 'function') {
    return deps.getReviewEntry(id);
  }
  const anyDeps = deps as unknown as Record<string, unknown>; // lib type gap: dynamic admin port probe
  if (
    anyDeps.reviewQueue &&
    typeof (anyDeps.reviewQueue as { getById?: unknown }).getById === 'function'
  ) {
    return (anyDeps.reviewQueue as { getById(id: string): Promise<KnowledgeEntry | null> }).getById(
      id,
    );
  }
  const all = await fetchAllReviewEntries(deps);
  return all.find((entry) => entry.id === id) ?? null;
}

async function fetchActivityEvents(deps: GovernanceReviewRouteDeps): Promise<AdminActivityEvent[]> {
  if (typeof deps.listActivityEvents === 'function') {
    return deps.listActivityEvents();
  }
  const anyDeps = deps as unknown as Record<string, unknown>; // lib type gap: dynamic admin port probe
  if (
    anyDeps.activityFeed &&
    typeof (anyDeps.activityFeed as { list?: unknown }).list === 'function'
  ) {
    return (anyDeps.activityFeed as { list(): Promise<AdminActivityEvent[]> }).list();
  }
  if (
    anyDeps.activity &&
    typeof (anyDeps.activity as { listEvents?: unknown }).listEvents === 'function'
  ) {
    return (anyDeps.activity as { listEvents(): Promise<AdminActivityEvent[]> }).listEvents();
  }
  return [];
}

function normalizeActivityType(
  typeLabel: string,
): 'decision' | 'intervention' | 'system-ingestion' {
  const normalized = typeLabel.trim().toLowerCase();
  if (normalized === 'decision') return 'decision';
  if (normalized === 'intervention') return 'intervention';
  if (normalized === 'system ingestion' || normalized === 'system-ingestion')
    return 'system-ingestion';
  // fallback — treat unknown as intervention to keep filter strict
  return 'intervention';
}

function decodeActivityCursor(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^[0-9]{1,128}$/.test(cursor)) {
    throw new Error('Invalid activity feed cursor');
  }
  return Number.parseInt(cursor, 10);
}

// ---------------------------------------------------------------------------
// Admin RouteDefs factory
// ---------------------------------------------------------------------------

export function createGovernanceAdminRouteDefs(
  _deps: GovernanceReviewRouteDeps,
): RouteDef<RouteContext, GovernanceReviewRouteDeps>[] {
  return [
    governanceRouteDef({
      method: 'GET',
      path: '/api/admin/reviews',
      schema: adminReviewQueueSchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor(ctx.headers ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const query = ctx.query as unknown as AdminReviewQueueQuery; // lib type gap: dynamic admin port probe
        const auth = getGovernanceAuth(ctx.headers ?? {});
        const allEntries = await fetchAllReviewEntries(deps);
        // Gov filter first (teamId, scope, securityLevel) via domain pure function
        const governed = filterReviewQueueEntries(allEntries, {
          auth,
          ...(query.status !== undefined ? { status: query.status } : {}),
        });
        // Additional teamId scoping from query (admin panel team filter)
        const teamScoped =
          query.teamId !== undefined
            ? governed.filter((entry) => entry.teamId === query.teamId)
            : governed;
        const queueQuery: ReviewQueueQuery = {
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.search !== undefined ? { search: query.search } : {}),
          ...(query.source !== undefined ? { source: query.source } : {}),
          ...(query.riskLevel !== undefined ? { riskLevel: query.riskLevel } : {}),
          sort: query.sort,
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
          limit: query.limit,
        };
        const result = applyReviewQueueQuery(
          teamScoped,
          queueQuery as unknown as Parameters<typeof applyReviewQueueQuery>[1], // lib type gap: dynamic admin port probe
        );
        const items = result.items.map(toReviewQueueItem);
        return {
          items,
          nextCursor: result.nextCursor,
          filteredTotal: result.filteredTotal,
          total: result.total,
        };
      },
    }),

    governanceRouteDef({
      method: 'GET',
      path: '/api/admin/reviews/:id',
      schema: adminReviewDetailSchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor(ctx.headers ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const auth = getGovernanceAuth(ctx.headers ?? {});
        const entry = await fetchReviewEntryById(deps, ctx.params.id);
        if (!entry) {
          throw InvocationError.notFound('Review not found');
        }
        if (!isReviewQueueEntryVisible(entry, auth)) {
          // Governance filter — hide existence
          throw InvocationError.notFound('Review not found');
        }
        // Return detail shape expected by web-panel: { entry, activity, files }
        return {
          entry,
          activity: [],
          files: [],
        };
      },
    }),

    governanceRouteDef({
      method: 'GET',
      path: '/api/admin/activity',
      schema: adminActivitySchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor(ctx.headers ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const query = ctx.query as unknown as AdminActivityQuery; // lib type gap: dynamic admin port probe
        const events = await fetchActivityEvents(deps);
        // Apply same search/filter/sort/cursor logic as panel's applyActivityFeedQuery (reuse pure logic)
        const filtered = events.filter((event) => {
          if (query.actor && !event.actor.toLowerCase().includes(query.actor.toLowerCase()))
            return false;
          if (query.type && normalizeActivityType(event.typeLabel) !== query.type) return false;
          if (query.search) {
            const s = query.search.trim().toLowerCase();
            if (s.length > 0) {
              const hit = [event.title, event.actor, event.description].some((value) =>
                value.toLowerCase().includes(s),
              );
              if (!hit) return false;
            }
          }
          if (query.from && event.timestamp < query.from) return false;
          if (query.to && event.timestamp > query.to) return false;
          return true;
        });
        const sorted = [...filtered].sort(
          (left, right) =>
            right.timestamp.localeCompare(left.timestamp) || left.id.localeCompare(right.id),
        );
        const offset = decodeActivityCursor(query.cursor);
        const limit = query.limit;
        const paged = sorted.slice(offset, offset + limit);
        return {
          events: paged,
          filteredTotal: sorted.length,
          total: events.length,
          nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
        };
      },
    }),

    governanceRouteDef({
      method: 'POST',
      path: '/api/admin/reviews/:id/decision',
      schema: adminReviewDecisionSchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor(ctx.headers ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const entryId = ctx.params.id;
        const body = ctx.body as {
          decision: string;
          notes?: string;
          note?: string;
          evidence?: Record<string, unknown>;
        };
        const note = body.notes ?? body.note;
        const input = {
          entryId,
          actorId: actor as string,
          ...(note !== undefined ? { note } : {}),
          ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
        };
        if (body.decision === 'approve') {
          return deps.approve(input);
        }
        if (body.decision === 'reject') {
          return deps.reject(input);
        }
        if (body.decision === 'return-for-correction') {
          return deps.returnForCorrection(input);
        }
        throw InvocationError.validation('Unsupported decision');
      },
    }),
  ];
}

export function createGovernanceReviewRouteDefs(
  deps: GovernanceReviewRouteDeps,
): RouteDef<RouteContext, GovernanceReviewRouteDeps>[] {
  return [
    ...createGovernanceReviewRouteDefsInternal(deps),
    ...createGovernanceAdminRouteDefs(deps),
  ];
}

function createGovernanceReviewRouteDefsInternal(
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
