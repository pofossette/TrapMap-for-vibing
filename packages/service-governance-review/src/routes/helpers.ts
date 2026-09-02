// @ts-nocheck
// Governance review shared helpers — extracted from routes.ts for P1 modularity
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
  filterReviewQueueEntries,
  isReviewQueueEntryVisible,
} from '@trapmap/backend-core/governance-review/domain/policy.js';
import { applyReviewQueueQuery } from '@trapmap/backend-core/governance-review/domain/review-queue-query.js';
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
  Partial<GovernanceReviewReadinessOptions> & {
    knowledgeOwner?: {
      listByFilter(filter: Record<string, unknown>): Promise<{ items: KnowledgeEntry[]; total: number } | KnowledgeEntry[]>;
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
  dataOwner: ['review-queue', 'feedback-record', 'remediation-workbench', 'maintenance-decay-workbench', 'governance-audit'],
  projectionOwner: ['review-queue-projection', 'feedback-operator-projection', 'maintenance-decay-operator-projection'],
  doesNotOwn: ['knowledge-aggregate-final-mutation', 'knowledge-lifecycle-authoritative-tables', 'retrieval-read-projection'],
  syncBoundary: 'governance-review only owns governance command receipt, eligibility check, flow interpretation, and audit. Final aggregate mutation must be delegated through KnowledgeWritePort.',
  asyncBoundary: 'Post-approval/rejection/maintenance/decay follow-up actions enter outbox/queue/workflow as async follow-up and never return to the synchronous command path.',
  commandSurface: ['approve', 'reject', 'returnForCorrection', 'applyMaintenance', 'applyDecay', 'reviewArtifact', 'submitFeedback'],
  delegateTo: 'knowledge-write',
} as const;

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());

export const reviewCommandSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    entryId: z.string(),
    actorId: z.string(),
    note: z.string().optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const maintenanceCommandSchema = z.object({
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

export const conflictDetectSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ entryId: z.string(), sourceEventId: z.string().optional() }),
});

export const reviewArtifactSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ artifactId: z.string(), decision: z.string(), actorId: z.string(), note: z.string().optional() }),
});

export const feedbackSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema.optional(),
  body: z.object({ entryId: z.string(), problemType: z.string(), description: z.string(), actorId: z.string().optional(), entryType: z.string().optional() }).passthrough(),
});

export const remediationReactivationSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: remediationReactivationPayloadSchema,
});

export const badcaseExportDraftSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: badcaseExportDraftPayloadSchema,
});

export const retrievalProjectionSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ entryIds: z.array(z.string()) }),
});

export const feedbackAdminListSchema = z.object({
  params: emptyRecord,
  query: feedbackListRequestSchema,
  headers: headersSchema,
  body: z.unknown(),
});

export const feedbackAdminBatchSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: feedbackBatchRequestSchema,
});

export const feedbackAdminStatsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

export const feedbackAdminRemediationCompleteSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: feedbackRemediationCompleteRequestSchema,
});

export const healthSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
  headers: headersSchema.optional(),
});

export const adminReviewQueueSchema = z.object({
  params: emptyRecord,
  query: adminReviewQueueQuerySchema,
  headers: headersSchema,
  body: z.unknown(),
});

export const adminReviewDetailSchema = z.object({
  params: z.object({ id: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.unknown(),
});

export const adminActivitySchema = z.object({
  params: emptyRecord,
  query: adminActivityQuerySchema,
  headers: headersSchema,
  body: z.unknown(),
});

export const adminReviewDecisionSchema = z.object({
  params: z.object({ id: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  body: z.object({ decision: z.string(), notes: z.string().optional(), note: z.string().optional(), evidence: z.record(z.string(), z.unknown()).optional() }),
});

export function reviewCommandArgs(ctx: RouteContext): { entryId: string; actorId: string; note?: string; evidence?: Record<string, unknown> } {
  const body = ctx.body as { entryId: string; actorId: string; note?: string; evidence?: Record<string, unknown> };
  return { entryId: body.entryId, actorId: body.actorId, ...(body.note !== undefined ? { note: body.note } : {}), ...(body.evidence !== undefined ? { evidence: body.evidence } : {}) };
}

export function maintenanceCommandArgs(ctx: RouteContext): { entryId: string; actorId: string; action: string; note?: string; evidence?: Record<string, unknown> } {
  const body = ctx.body as { entryId: string; actorId: string; action: string; note?: string; evidence?: Record<string, unknown> };
  return { entryId: body.entryId, actorId: body.actorId, action: body.action, ...(body.note !== undefined ? { note: body.note } : {}), ...(body.evidence !== undefined ? { evidence: body.evidence } : {}) };
}

export function readAdminActor(headers: Record<string, unknown>, body: unknown): string | RouteSuccess {
  const actor = (headers['x-trapmap-actor-id'] ?? (body as Record<string, unknown>)?.actorId) as unknown;
  if (typeof actor !== 'string' || actor.length === 0) {
    return routeResponse(401, { error: 'Missing actor' }) as RouteSuccess;
  }
  return actor;
}

export function withAdminActor<T>(module: GovernanceReviewRouteDeps, ctx: RouteContext, fn: (admin: GovernanceReviewAdminPort, actorId: string) => Promise<T>): Promise<T> {
  const actor = readAdminActor(ctx.headers ?? {}, ctx.body);
  if (isRouteResponse(actor)) return actor as unknown as Promise<T>;
  if (!module.admin) throw InvocationError.unavailable('Admin unavailable');
  return fn(module.admin, actor as string);
}

export function readinessHandler(deps: GovernanceReviewRouteDeps) {
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

export function governanceRouteDef<Ctx extends RouteContext>(def: { method: string; path: string; schema: ZodType; successStatus?: number; handler: (ctx: Ctx, deps: GovernanceReviewRouteDeps) => Promise<unknown> }): RouteDef<Ctx, GovernanceReviewRouteDeps> {
  return def as unknown as RouteDef<Ctx, GovernanceReviewRouteDeps>;
}

export function getGovernanceAuth(headers: Record<string, unknown>): { subjectType: 'user' | 'system-admin'; activeTeamId: string | null; securityLevel: number } {
  const subjectType = headers['x-trapmap-subject-type'] === 'system-admin' ? 'system-admin' as const : 'user' as const;
  const activeTeamId = typeof headers['x-trapmap-team-id'] === 'string' ? (headers['x-trapmap-team-id'] as string) : typeof headers['x-trapmap-active-team-id'] === 'string' ? (headers['x-trapmap-active-team-id'] as string) : null;
  const rawLevel = (headers as Record<string, unknown>)['x-trapmap-security-level'] ?? (headers as Record<string, unknown>)['x-trapmap-securityLevel'];
  const securityLevel = typeof rawLevel === 'string' ? Number.parseInt(rawLevel, 10) : typeof rawLevel === 'number' ? rawLevel : 0;
  const clamped = Number.isFinite(securityLevel) ? Math.max(0, Math.min(10, securityLevel)) : 0;
  return { subjectType, activeTeamId, securityLevel: clamped };
}

export function toReviewQueueItem(entry: KnowledgeEntry) {
  return {
    entry,
    agentReview: (entry as unknown as Record<string, unknown>).agentReview ?? null,
    submittedBy: (entry as unknown as Record<string, unknown>).latestSubmission ? ((entry as unknown as Record<string, unknown>).latestSubmission as Record<string, unknown>).submittedBy ?? (entry as unknown as Record<string, unknown>).owner : (entry as unknown as Record<string, unknown>).owner,
    lastDecision: ((entry as unknown as Record<string, unknown>).reviewHistory as unknown[] | undefined)?.at(-1) ?? null,
    latestSubmission: (entry as unknown as Record<string, unknown>).latestSubmission ?? null,
    reviewNotes: (entry as unknown as Record<string, unknown>).reviewNotes ?? [],
  };
}

export async function fetchAllReviewEntries(deps: GovernanceReviewRouteDeps): Promise<KnowledgeEntry[]> {
  if (deps.knowledgeOwner && typeof deps.knowledgeOwner.listByFilter === 'function') {
    const r = await deps.knowledgeOwner.listByFilter({});
    return Array.isArray(r) ? r : r.items;
  }
  if (typeof deps.listReviewEntries === 'function') return deps.listReviewEntries();
  const anyDeps = deps as Record<string, unknown>;
  if (anyDeps.reviewQueue && typeof (anyDeps.reviewQueue as { list?: unknown }).list === 'function') {
    const res = await (anyDeps.reviewQueue as { list: () => Promise<KnowledgeEntry[]> }).list();
    return res;
  }
  return [];
}

export async function fetchReviewEntryById(deps: GovernanceReviewRouteDeps, id: string): Promise<KnowledgeEntry | null> {
  if (deps.knowledgeOwner && typeof deps.knowledgeOwner.getById === 'function') return deps.knowledgeOwner.getById(id);
  if (typeof deps.getReviewEntry === 'function') return deps.getReviewEntry(id);
  const anyDeps = deps as Record<string, unknown>;
  if (anyDeps.reviewQueue && typeof (anyDeps.reviewQueue as { getById?: unknown }).getById === 'function') {
    return (anyDeps.reviewQueue as { getById: (id: string) => Promise<KnowledgeEntry | null> }).getById(id);
  }
  return null;
}

export async function fetchActivityEvents(deps: GovernanceReviewRouteDeps): Promise<AdminActivityEvent[]> {
  if (typeof deps.listActivityEvents === 'function') return deps.listActivityEvents();
  const anyDeps = deps as Record<string, unknown>;
  if (anyDeps.activityFeed && typeof (anyDeps.activityFeed as { list?: unknown }).list === 'function') return (anyDeps.activityFeed as { list: () => Promise<AdminActivityEvent[]> }).list();
  if (anyDeps.activity && typeof (anyDeps.activity as { listEvents?: unknown }).listEvents === 'function') return (anyDeps.activity as { listEvents: () => Promise<AdminActivityEvent[]> }).listEvents();
  return [];
}

export function normalizeActivityType(typeLabel: string): string {
  return typeLabel.toLowerCase().replace(/\s+/g, '_');
}

export function decodeActivityCursor(cursor?: string): number {
  const n = Number(cursor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export { GOVERNANCE_REVIEW_OWNERSHIP };
