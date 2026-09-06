/**
 * Gateway external API routes as framework-neutral RouteDefs.
 *
 * The gateway is the ONLY service exposed to external clients. Each RouteDef
 * forwards to the matching internal service via the existing
 * `internal-client`; per-route validation lives in the Zod schemas (single
 * source — no hand-written `validateBody` copies), and the shared adapter
 * renders the canonical error envelope. Upstream HTTP errors are forwarded
 * as-is; thrown errors (auth resolution) map through the shared error
 * mapping.
 */

import {
  type HttpMethod,
  InvocationError,
  type RouteContext,
  type RouteDef,
  routeResponse,
} from '@trapmap/backend-core';
import {
  adminActivityQuerySchema,
  adminArtifactQuerySchema,
  adminGraphQuerySchema,
  adminReviewQueueQuerySchema,
  type SkillLookupQuery,
  skillLookupQuerySchema,
} from '@trapmap/contracts';
import type { FastifyRequest } from 'fastify';
import { type ZodType, z } from 'zod';

import type { InternalServiceClients } from '../internal-client/index.js';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** Authenticated actor attached by the gateway auth hook. */
interface GatewayActor {
  id?: string | undefined;
  handle?: string | undefined;
  securityLevel?: number | undefined;
  teamId?: string | null | undefined;
}

interface GatewayRouteContext extends RouteContext {
  actor?: GatewayActor;
}

type GatewayAuthRequest = FastifyRequest & {
  actorId?: string;
  actorHandle?: string;
  actorSecurityLevel?: number;
  actorTeamId?: string | null;
};

/** Adapter context extractor: surface the auth-hook-resolved actor to handlers. */
export function gatewayActorContext(request: FastifyRequest): Record<string, unknown> {
  const actorRequest = request as GatewayAuthRequest;
  return {
    actor: {
      id: actorRequest.actorId,
      handle: actorRequest.actorHandle,
      securityLevel: actorRequest.actorSecurityLevel,
      teamId: actorRequest.actorTeamId,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export const emptyRecord = z.record(z.string(), z.unknown());
export const headersSchema = z.record(z.string(), z.unknown());
/**
 * The gateway auth hook resolves the actor for every non-public request and
 * the adapter context extractor always injects the `actor` key, so the
 * schema requires the field; 401/403 stay in the auth hook / handler
 * helpers, never in the schema.
 */
export const actorSchema = z.object({
  id: z.string().optional(),
  handle: z.string().optional(),
  securityLevel: z.number().optional(),
  teamId: z.string().nullable().optional(),
});

export function forwardedTraceHeaders(
  headers: Record<string, unknown>,
): Record<string, string> | undefined {
  const requestId = headers['x-request-id'];
  const traceId = headers['x-trace-id'];
  const traceParent = headers.traceparent;
  const correlationId = headers['x-correlation-id'];
  const forwarded: Record<string, string> = {};
  if (typeof requestId === 'string' && requestId.length > 0) {
    forwarded['x-request-id'] = requestId;
  }
  if (typeof traceId === 'string' && traceId.length > 0) {
    forwarded['x-trace-id'] = traceId;
  }
  if (typeof traceParent === 'string' && traceParent.length > 0) {
    forwarded.traceparent = traceParent;
  }
  if (typeof correlationId === 'string' && correlationId.length > 0) {
    forwarded['x-correlation-id'] = correlationId;
  }
  return Object.keys(forwarded).length > 0 ? forwarded : undefined;
}

export function trustedActorHeaders(ctx: GatewayRouteContext): Record<string, string> | undefined {
  const headers = forwardedTraceHeaders(ctx.headers ?? {}) ?? {};
  if (ctx.actor?.id) {
    headers['x-trapmap-actor-id'] = ctx.actor.id;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function trustedArtifactImportHeaders(
  ctx: GatewayRouteContext,
): Record<string, string> | undefined {
  const headers = trustedActorHeaders(ctx) ?? {};
  const actor = ctx.actor;
  if (actor?.handle) headers['x-trapmap-actor-handle'] = actor.handle;
  if (actor?.securityLevel !== undefined) {
    headers['x-trapmap-security-level'] = String(actor.securityLevel);
  }
  if (actor?.teamId) headers['x-trapmap-team-id'] = actor.teamId;
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function trustedActorOptions(ctx: GatewayRouteContext): {
  headers?: Record<string, string>;
} {
  const headers = trustedActorHeaders(ctx);
  return headers ? { headers } : {};
}

export function trustedArtifactImportOptions(ctx: GatewayRouteContext): {
  headers?: Record<string, string>;
} {
  const headers = trustedArtifactImportHeaders(ctx);
  return headers ? { headers } : {};
}

export function trustedAdminHeaders(ctx: GatewayRouteContext): Record<string, string> | undefined {
  const headers = trustedArtifactImportHeaders(ctx) ?? {};
  if (ctx.actor?.handle === 'system-admin' || ctx.actor?.id === 'system-admin') {
    headers['x-trapmap-subject-type'] = 'system-admin';
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function trustedAdminOptions(ctx: GatewayRouteContext): {
  headers?: Record<string, string>;
} {
  const headers = trustedAdminHeaders(ctx);
  return headers ? { headers } : {};
}

export function bodyWithoutActor(body: unknown): Record<string, unknown> {
  const { actorId: _untrustedActorId, ...stripped } = (body ?? {}) as Record<string, unknown>;
  return stripped;
}

/**
 * Resolve the authenticated actor from the auth-hook-attached identity and
 * reject spoofed body actors. Throws so the adapter renders the canonical
 * 401/403 envelope; handlers only run for genuinely trusted actors.
 */
export function requireTrustedActor(ctx: GatewayRouteContext): {
  actorId: string;
  body: Record<string, unknown>;
} {
  const actorId = ctx.actor?.id;
  if (!actorId) {
    throw InvocationError.unauthorized('Missing authenticated actor');
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (typeof body.actorId === 'string' && body.actorId !== actorId) {
    throw InvocationError.forbidden('Body actor does not match authenticated actor');
  }
  return { actorId, body: bodyWithoutActor(ctx.body) };
}

export function searchBodyArgs(ctx: GatewayRouteContext): {
  limit?: number;
  query: string;
  teamId?: string;
} {
  const body = ctx.body as { limit?: number; query: string; teamId?: string };
  return {
    query: body.query,
    ...(body.teamId !== undefined ? { teamId: body.teamId } : {}),
    ...(body.limit !== undefined ? { limit: body.limit } : {}),
  };
}

export function skillLookupArgs(ctx: GatewayRouteContext): SkillLookupQuery {
  const body = ctx.body as SkillLookupQuery;
  return { text: body.text, maxResults: body.maxResults };
}

export function knowledgeActionBodyArgs(ctx: GatewayRouteContext): {
  action: string;
  actorId: string;
  entryId: string;
  evidence?: Record<string, unknown>;
  note?: string;
} {
  const body = ctx.body as {
    action: string;
    entryId: string;
    evidence?: Record<string, unknown>;
    note?: string;
  };
  const trusted = requireTrustedActor(ctx);
  return {
    entryId: body.entryId,
    action: body.action,
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
    actorId: trusted.actorId,
  };
}

export function queryStringValues(query: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(query).flatMap(([key, value]) => {
      if (Array.isArray(value)) return [[key, value.map(String).join(',')]];
      if (value === undefined || value === null) return [];
      return [[key, String(value)]];
    }),
  );
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * `z.unknown()` accepts `undefined`, so a missing/undefined field would
 * pass validation and be forwarded as `undefined`; this requires the field
 * to be present with a non-null, non-undefined value (the pre-RouteDef
 * `validateBody` semantics).
 */
export const requiredDefinedValue = z
  .unknown()
  .refine((value): value is unknown => value !== undefined && value !== null, {
    message: 'Required',
  });

export const actorHeadersSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const artifactImportSchema = actorHeadersSchema.extend({
  body: z.object({ bundles: z.unknown(), actorId: z.string().optional() }),
});

export const artifactExportSchema = actorHeadersSchema.extend({
  body: z.object({ artifactId: z.string(), format: z.string(), actorId: z.string().optional() }),
});

export const artifactActivateSchema = actorHeadersSchema.extend({
  body: z.object({
    artifactId: z.string(),
    selectedPaths: z.unknown(),
    actorId: z.string().optional(),
  }),
});

export const artifactIdParamsSchema = actorHeadersSchema.extend({
  params: z.object({ artifactId: z.string() }),
});

export const artifactReviewSchema = actorHeadersSchema.extend({
  params: z.object({ artifactId: z.string() }),
  body: z.object({ decision: z.string(), actorId: z.string().optional() }),
});

export const sessionTokenBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ sessionToken: z.string() }),
});

export const createTeamBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ name: z.string(), slug: z.string(), actorId: z.string() }),
});

export const listTeamsSchema = z.object({
  params: emptyRecord,
  query: z.object({ userId: z.string().min(1) }),
  body: z.unknown(),
});

export const selectTeamBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ sessionToken: z.string(), teamId: z.string() }),
});

export const addMemberBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ teamId: z.string(), userId: z.string(), role: z.string(), actorId: z.string() }),
});

export const updateMemberSchema = actorHeadersSchema.extend({
  params: z.object({ memberId: z.string() }),
  body: z.object({
    updates: z.record(z.string(), z.unknown()).optional(),
    actorId: z.string(),
  }),
});

export const provisionAccessKeyBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ memberId: z.string(), actorId: z.string() }),
});

export const mineQuerySchema = z.object({
  params: emptyRecord,
  query: z.object({ userId: z.string().min(1), teamId: z.string().min(1).optional() }),
  body: z.unknown(),
});

export const entryParamsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

export const knowledgeSubmitSchema = actorHeadersSchema.extend({
  body: z.object({
    content: z.string(),
    title: z.string().optional(),
    labels: z.array(z.string()).optional(),
    teamId: z.string().optional(),
    actorId: z.string(),
  }),
});

export const entryMutationSchema = actorHeadersSchema.extend({
  params: z.object({ entryId: z.string() }),
  body: z.record(z.string(), z.unknown()),
});

export const supersedeSchema = actorHeadersSchema.extend({
  params: z.object({ entryId: z.string() }),
  body: z.object({ replacementId: z.string(), actorId: z.string().optional() }),
});

export const createTrapSchema = actorHeadersSchema.extend({
  body: z.object({
    content: z.string(),
    teamId: z.string(),
    title: z.string().optional(),
    actorId: z.string(),
  }),
});

export const listTrapsSchema = z.object({
  params: emptyRecord,
  query: z.object({ teamId: z.string().min(1) }),
  body: z.unknown(),
});

export const trapParamsSchema = z.object({
  params: z.object({ trapId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

export const searchBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    query: z.string(),
    teamId: z.string().optional(),
    limit: z.number().optional(),
  }),
});

export const skillLookupBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: skillLookupQuerySchema,
});

export const candidateSubmitSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ id: z.string(), content: z.string(), submittedBy: z.string() }),
});

export const candidateParamsSchema = z.object({
  params: z.object({ candidateId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

export const candidateListSchema = z.object({
  params: emptyRecord,
  query: z.object({ status: z.string().optional() }),
  body: z.unknown(),
});

export const candidateResolutionSchema = actorHeadersSchema.extend({
  params: z.object({ candidateId: z.string() }),
  body: z.object({ resolution: requiredDefinedValue }).passthrough(),
});

export const candidateManualResultSchema = actorHeadersSchema.extend({
  params: z.object({ candidateId: z.string() }),
  body: z.object({ result: requiredDefinedValue }).passthrough(),
});

export const reviewDecisionSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    entryId: z.string(),
    decision: z.enum(['approve', 'reject', 'return-for-correction']),
    actorId: z.string(),
    note: z.string().optional(),
  }),
});

export const knowledgeActionSchema = actorHeadersSchema.extend({
  body: z.object({
    entryId: z.string(),
    action: z.string(),
    note: z.string().optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
    actorId: z.string(),
  }),
});

export const feedbackSchema = actorHeadersSchema.extend({
  body: z
    .object({
      entryId: z.string(),
      problemType: z.string(),
      description: z.string(),
      actorId: z.string().optional(),
    })
    .passthrough(),
});

export const feedbackAdminQuerySchema = z.object({
  params: emptyRecord,
  query: z.record(z.string(), z.unknown()),
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const feedbackAdminStatsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const feedbackAdminRemediationParamsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const artifactReviewBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    artifactId: z.string(),
    decision: z.enum(['approve', 'reject']),
    actorId: z.string(),
    note: z.string().optional(),
  }),
});

export const adminReviewQueueSchema = z.object({
  params: emptyRecord,
  query: adminReviewQueueQuerySchema,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminReviewDetailSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminActivitySchema = z.object({
  params: emptyRecord,
  query: adminActivityQuerySchema,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminReviewDecisionSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.object({
    decision: z.enum(['approve', 'reject', 'return-for-correction']),
    notes: z.string().min(1).max(2000).optional(),
    note: z.string().min(1).max(2000).optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const adminRuntimeOverviewSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminManualJsonEditSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.object({
    filePath: z.string().min(1).max(500).optional(),
    payload: z.unknown(),
    rationale: z.string().trim().min(1).max(2000),
  }),
});

export const adminArtifactListSchema = z.object({
  params: emptyRecord,
  query: adminArtifactQuerySchema,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminArtifactDetailSchema = z.object({
  params: z.object({ id: z.string().min(1).max(128) }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminTrapGraphSchema = z.object({
  params: emptyRecord,
  query: adminGraphQuerySchema,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminSkillGraphSchema = z.object({
  params: emptyRecord,
  query: adminGraphQuerySchema,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const adminSkillGraphByIdSchema = z.object({
  params: z.object({ artifactId: z.string().min(1).max(128) }),
  query: adminGraphQuerySchema,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const reviewQueueSchema = z.object({
  params: emptyRecord,
  query: z.record(z.string(), z.unknown()),
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

export const scheduleJobSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    type: z.string(),
    payload: requiredDefinedValue,
    delayMs: z.number().optional(),
    priority: z.number().optional(),
    maxAttempts: z.number().optional(),
    dedupeKey: z.string().optional(),
  }),
});

export const jobParamsSchema = z.object({
  params: z.object({ jobId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

export const cronJobParamsSchema = actorHeadersSchema.extend({
  params: z.object({ jobId: z.string() }),
});

export const cronCreateJobSchema = actorHeadersSchema.extend({
  body: z.record(z.string(), z.unknown()),
});

export function gatewayRouteDef<Ctx extends GatewayRouteContext>(def: {
  method: HttpMethod;
  path: string;
  schema: ZodType<Ctx>;
  handler(ctx: Ctx, clients: InternalServiceClients): Promise<unknown>;
}): RouteDef<Ctx, InternalServiceClients> {
  return def;
}

export async function forward(
  promise: Promise<{ status: number; body: unknown }>,
): Promise<{ status: number; body: unknown }> {
  const result = await promise;
  return routeResponse(result.status, result.body);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
