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

import type { FastifyRequest } from 'fastify';
import { type ZodType, z } from 'zod';

import {
  type HttpMethod,
  InvocationError,
  type RouteContext,
  type RouteDef,
  routeResponse,
} from '@trapmap/backend-core';

import type { InternalServiceClients } from './internal-client.js';

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

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());
/**
 * The gateway auth hook resolves the actor for every non-public request and
 * the adapter context extractor always injects the `actor` key, so the
 * schema requires the field; 401/403 stay in the auth hook / handler
 * helpers, never in the schema.
 */
const actorSchema = z.object({
  id: z.string().optional(),
  handle: z.string().optional(),
  securityLevel: z.number().optional(),
  teamId: z.string().nullable().optional(),
});

function forwardedTraceHeaders(
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

function trustedActorHeaders(ctx: GatewayRouteContext): Record<string, string> | undefined {
  const headers = forwardedTraceHeaders(ctx.headers ?? {}) ?? {};
  if (ctx.actor?.id) {
    headers['x-trapmap-actor-id'] = ctx.actor.id;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function trustedArtifactImportHeaders(
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

function trustedActorOptions(ctx: GatewayRouteContext): { headers?: Record<string, string> } {
  const headers = trustedActorHeaders(ctx);
  return headers ? { headers } : {};
}

function trustedArtifactImportOptions(ctx: GatewayRouteContext): {
  headers?: Record<string, string>;
} {
  const headers = trustedArtifactImportHeaders(ctx);
  return headers ? { headers } : {};
}

function bodyWithoutActor(body: unknown): Record<string, unknown> {
  const { actorId: _untrustedActorId, ...stripped } = (body ?? {}) as Record<string, unknown>;
  return stripped;
}

/**
 * Resolve the authenticated actor from the auth-hook-attached identity and
 * reject spoofed body actors. Throws so the adapter renders the canonical
 * 401/403 envelope; handlers only run for genuinely trusted actors.
 */
function requireTrustedActor(ctx: GatewayRouteContext): {
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

function queryStringValues(query: Record<string, unknown>): Record<string, string> {
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
const requiredDefinedValue = z
  .unknown()
  .refine((value): value is unknown => value !== undefined && value !== null, {
    message: 'Required',
  });

const actorHeadersSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

const artifactImportSchema = actorHeadersSchema.extend({
  body: z.object({ bundles: z.unknown(), actorId: z.string().optional() }),
});

const artifactExportSchema = actorHeadersSchema.extend({
  body: z.object({ artifactId: z.string(), format: z.string(), actorId: z.string().optional() }),
});

const artifactActivateSchema = actorHeadersSchema.extend({
  body: z.object({
    artifactId: z.string(),
    selectedPaths: z.unknown(),
    actorId: z.string().optional(),
  }),
});

const artifactIdParamsSchema = actorHeadersSchema.extend({
  params: z.object({ artifactId: z.string() }),
});

const artifactReviewSchema = actorHeadersSchema.extend({
  params: z.object({ artifactId: z.string() }),
  body: z.object({ decision: z.string(), actorId: z.string().optional() }),
});

const sessionTokenBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ sessionToken: z.string() }),
});

const createTeamBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ name: z.string(), slug: z.string(), actorId: z.string() }),
});

const listTeamsSchema = z.object({
  params: emptyRecord,
  query: z.object({ userId: z.string() }),
  body: z.unknown(),
});

const selectTeamBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ sessionToken: z.string(), teamId: z.string() }),
});

const addMemberBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ teamId: z.string(), userId: z.string(), role: z.string(), actorId: z.string() }),
});

const updateMemberSchema = actorHeadersSchema.extend({
  params: z.object({ memberId: z.string() }),
  body: z.object({
    updates: z.record(z.string(), z.unknown()).optional(),
    actorId: z.string().optional(),
  }),
});

const provisionAccessKeyBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ memberId: z.string(), actorId: z.string() }),
});

const mineQuerySchema = z.object({
  params: emptyRecord,
  query: z.object({ userId: z.string(), teamId: z.string().optional() }),
  body: z.unknown(),
});

const entryParamsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const knowledgeSubmitSchema = actorHeadersSchema.extend({
  body: z.object({
    content: z.string(),
    title: z.string().optional(),
    labels: z.array(z.string()).optional(),
    teamId: z.string().optional(),
    actorId: z.string().optional(),
  }),
});

const entryMutationSchema = actorHeadersSchema.extend({
  params: z.object({ entryId: z.string() }),
  body: z.record(z.string(), z.unknown()),
});

const supersedeSchema = actorHeadersSchema.extend({
  params: z.object({ entryId: z.string() }),
  body: z.object({ replacementId: z.string(), actorId: z.string().optional() }),
});

const createTrapSchema = actorHeadersSchema.extend({
  body: z.object({
    content: z.string(),
    teamId: z.string(),
    title: z.string().optional(),
    actorId: z.string().optional(),
  }),
});

const listTrapsSchema = z.object({
  params: emptyRecord,
  query: z.object({ teamId: z.string() }),
  body: z.unknown(),
});

const trapParamsSchema = z.object({
  params: z.object({ trapId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const searchBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    query: z.string(),
    teamId: z.string().optional(),
    limit: z.number().optional(),
  }),
});

const candidateSubmitSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({ id: z.string(), content: z.string(), submittedBy: z.string() }),
});

const candidateParamsSchema = z.object({
  params: z.object({ candidateId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

const candidateListSchema = z.object({
  params: emptyRecord,
  query: z.object({ status: z.string().optional() }),
  body: z.unknown(),
});

const candidateResolutionSchema = actorHeadersSchema.extend({
  params: z.object({ candidateId: z.string() }),
  body: z.object({ resolution: requiredDefinedValue }).passthrough(),
});

const candidateManualResultSchema = actorHeadersSchema.extend({
  params: z.object({ candidateId: z.string() }),
  body: z.object({ result: requiredDefinedValue }).passthrough(),
});

const reviewDecisionSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    entryId: z.string(),
    decision: z.enum(['approve', 'reject']),
    actorId: z.string(),
    note: z.string().optional(),
  }),
});

const knowledgeActionSchema = actorHeadersSchema.extend({
  body: z.object({
    entryId: z.string(),
    action: z.string(),
    note: z.string().optional(),
    evidence: z.record(z.string(), z.unknown()).optional(),
    actorId: z.string().optional(),
  }),
});

const feedbackSchema = actorHeadersSchema.extend({
  body: z
    .object({
      entryId: z.string(),
      problemType: z.string(),
      description: z.string(),
      actorId: z.string().optional(),
    })
    .passthrough(),
});

const feedbackAdminQuerySchema = z.object({
  params: emptyRecord,
  query: z.record(z.string(), z.unknown()),
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

const feedbackAdminStatsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

const feedbackAdminRemediationParamsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  headers: headersSchema,
  actor: actorSchema,
  body: z.unknown(),
});

const artifactReviewBodySchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.object({
    artifactId: z.string(),
    decision: z.enum(['approve', 'reject']),
    actorId: z.string(),
    note: z.string().optional(),
  }),
});

const scheduleJobSchema = z.object({
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

const jobParamsSchema = z.object({
  params: z.object({ jobId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
});

function gatewayRouteDef<Ctx extends GatewayRouteContext>(def: {
  method: HttpMethod;
  path: string;
  schema: ZodType<Ctx>;
  handler(ctx: Ctx, clients: InternalServiceClients): Promise<unknown>;
}): RouteDef<Ctx, InternalServiceClients> {
  return def;
}

async function forward(
  promise: Promise<{ status: number; body: unknown }>,
): Promise<{ status: number; body: unknown }> {
  const result = await promise;
  return routeResponse(result.status, result.body);
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function createGatewayRouteDefs(_clients: InternalServiceClients): RouteDef[] {
  return [
    // ---- Artifact routes (knowledge-write) ----

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/artifacts/import',
      schema: artifactImportSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.importArtifact(
            bodyWithoutActor(ctx.body),
            trustedArtifactImportOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/artifacts/export',
      schema: artifactExportSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.exportArtifacts(
            (ctx.body ?? {}) as Record<string, unknown>,
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/artifacts/activate',
      schema: artifactActivateSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.activateArtifact(
            bodyWithoutActor(ctx.body),
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/operations/artifacts/review-queue',
      schema: actorHeadersSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(clients.knowledgeWrite.artifactReviewQueue(trustedActorOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/artifacts/:artifactId/edit',
      schema: artifactIdParamsSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.editArtifact(
            ctx.params.artifactId,
            bodyWithoutActor(ctx.body),
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/operations/artifacts/:artifactId/history',
      schema: artifactIdParamsSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.artifactHistory(ctx.params.artifactId, trustedActorOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/artifacts/:artifactId/review',
      schema: artifactReviewSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.reviewArtifact(
            ctx.params.artifactId,
            bodyWithoutActor(ctx.body),
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/artifacts/:artifactId/deactivate',
      schema: artifactIdParamsSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.deactivateArtifact(
            ctx.params.artifactId,
            bodyWithoutActor(ctx.body),
            trustedActorOptions(ctx),
          ),
        );
      },
    }),

    // ---- Auth routes (identity-access) ----

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/auth/logout',
      schema: sessionTokenBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.identityAccess.logout(ctx.body));
      },
    }),

    // ---- Team routes (identity-access) ----

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/teams',
      schema: createTeamBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.identityAccess.createTeam(ctx.body));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/teams',
      schema: listTeamsSchema,
      handler: async (ctx, clients) => {
        return forward(clients.identityAccess.listTeams(ctx.query.userId));
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/teams/select',
      schema: selectTeamBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.identityAccess.selectTeam(ctx.body));
      },
    }),

    // ---- Member routes (identity-access) ----

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/members',
      schema: addMemberBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.identityAccess.addMember(ctx.body));
      },
    }),
    gatewayRouteDef({
      method: 'PUT',
      path: '/v1/members/:memberId',
      schema: updateMemberSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.identityAccess.updateMember(ctx.params.memberId, {
            updates: (trusted.body.updates ?? {}) as Record<string, unknown>,
            actorId: trusted.actorId,
          }),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/access-keys',
      schema: provisionAccessKeyBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.identityAccess.provisionAccessKey(ctx.body));
      },
    }),

    // ---- Knowledge routes (knowledge-read / knowledge-write) ----

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/knowledge/mine',
      schema: mineQuerySchema,
      handler: async (ctx, clients) => {
        return forward(clients.knowledgeRead.listMine(ctx.query.userId, ctx.query.teamId));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/knowledge/projection-status',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        body: z.unknown(),
      }),
      handler: async (_ctx, clients) => {
        return forward(clients.knowledgeRead.getProjectionStatus());
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/knowledge/:entryId',
      schema: entryParamsSchema,
      handler: async (ctx, clients) => {
        return forward(clients.knowledgeRead.getById(ctx.params.entryId));
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge',
      schema: knowledgeSubmitSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.submit(
            {
              content: ctx.body.content,
              ...(ctx.body.title !== undefined ? { title: ctx.body.title } : {}),
              ...(ctx.body.labels !== undefined ? { labels: ctx.body.labels } : {}),
              ...(ctx.body.teamId !== undefined ? { teamId: ctx.body.teamId } : {}),
              actorId: trusted.actorId,
            },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'PUT',
      path: '/v1/knowledge/:entryId',
      schema: entryMutationSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.updateEntry(
            ctx.params.entryId,
            {
              updates: (trusted.body.updates ?? {}) as Record<string, unknown>,
              actorId: trusted.actorId,
            },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge/:entryId/resubmit',
      schema: entryMutationSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.resubmit(
            ctx.params.entryId,
            { ...trusted.body, actorId: trusted.actorId },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge/:entryId/supersede',
      schema: supersedeSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.supersede(
            ctx.params.entryId,
            { replacementId: trusted.body.replacementId as string, actorId: trusted.actorId },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/traps',
      schema: createTrapSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.createTrap(
            {
              content: ctx.body.content,
              teamId: ctx.body.teamId,
              ...(ctx.body.title !== undefined ? { title: ctx.body.title } : {}),
              actorId: trusted.actorId,
            },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/traps',
      schema: listTrapsSchema,
      handler: async (ctx, clients) => {
        return forward(clients.knowledgeWrite.listTraps(ctx.query.teamId));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/traps/:trapId',
      schema: trapParamsSchema,
      handler: async (ctx, clients) => {
        return forward(clients.knowledgeWrite.getTrap(ctx.params.trapId));
      },
    }),

    // ---- Retrieval routes (knowledge-read) ----

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/search',
      schema: searchBodySchema,
      handler: async (ctx, clients) => {
        return forward(
          clients.knowledgeRead.search({
            query: ctx.body.query,
            ...(ctx.body.teamId !== undefined ? { teamId: ctx.body.teamId } : {}),
            ...(ctx.body.limit !== undefined ? { limit: ctx.body.limit } : {}),
          }),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v3/retrieval/search',
      schema: searchBodySchema,
      handler: async (ctx, clients) => {
        return forward(
          clients.knowledgeRead.search({
            query: ctx.body.query,
            ...(ctx.body.teamId !== undefined ? { teamId: ctx.body.teamId } : {}),
            ...(ctx.body.limit !== undefined ? { limit: ctx.body.limit } : {}),
          }),
        );
      },
    }),

    // ---- Candidate routes (candidate-ingestion) ----

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/candidates',
      schema: candidateSubmitSchema,
      handler: async (ctx, clients) => {
        return forward(clients.candidateIngestion.submit(ctx.body));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/candidates/:candidateId',
      schema: candidateParamsSchema,
      handler: async (ctx, clients) => {
        return forward(clients.candidateIngestion.getById(ctx.params.candidateId));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/candidates',
      schema: candidateListSchema,
      handler: async (ctx, clients) => {
        return forward(clients.candidateIngestion.listByStatus(ctx.query.status ?? 'received'));
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/candidates/:candidateId/resolution',
      schema: candidateResolutionSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.candidateIngestion.applyResolution(
            ctx.params.candidateId,
            {
              resolution: trusted.body.resolution as Record<string, unknown>,
              actorId: trusted.actorId,
            },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/candidates/:candidateId/manual-result',
      schema: candidateManualResultSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.candidateIngestion.submitManualResult(
            ctx.params.candidateId,
            { result: trusted.body.result as Record<string, unknown>, actorId: trusted.actorId },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),

    // ---- Governance routes (governance-review / knowledge-write) ----

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge/review',
      schema: reviewDecisionSchema,
      handler: async (ctx, clients) => {
        const command = {
          entryId: ctx.body.entryId,
          actorId: ctx.body.actorId,
          ...(ctx.body.note !== undefined ? { note: ctx.body.note } : {}),
        };
        return forward(
          ctx.body.decision === 'approve'
            ? clients.review.approve(command)
            : clients.review.reject(command),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge/maintenance',
      schema: knowledgeActionSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.applyMaintenanceDecision(
            {
              entryId: ctx.body.entryId,
              action: ctx.body.action,
              ...(ctx.body.note !== undefined ? { note: ctx.body.note } : {}),
              ...(ctx.body.evidence !== undefined ? { evidence: ctx.body.evidence } : {}),
              actorId: trusted.actorId,
            },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge/decay',
      schema: knowledgeActionSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.knowledgeWrite.applyDecayDecision(
            {
              entryId: ctx.body.entryId,
              action: ctx.body.action,
              ...(ctx.body.note !== undefined ? { note: ctx.body.note } : {}),
              ...(ctx.body.evidence !== undefined ? { evidence: ctx.body.evidence } : {}),
              actorId: trusted.actorId,
            },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/feedback',
      schema: feedbackSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.review.submitFeedback(
            { ...ctx.body, actorId: trusted.actorId },
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/operations/feedback',
      schema: feedbackAdminQuerySchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.feedbackAdmin.list(queryStringValues(ctx.query), trustedActorOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/feedback/batch',
      schema: feedbackAdminQuerySchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(clients.feedbackAdmin.batch(trusted.body, trustedActorOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/operations/feedback/stats/:entryId',
      schema: feedbackAdminStatsSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(clients.feedbackAdmin.stats(ctx.params.entryId, trustedActorOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/operations/feedback/remediation',
      schema: feedbackAdminQuerySchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(clients.feedbackAdmin.listRemediation(trustedActorOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/operations/feedback/remediation/:entryId',
      schema: feedbackAdminRemediationParamsSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.feedbackAdmin.getRemediation(ctx.params.entryId, trustedActorOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/operations/feedback/remediation/:entryId/complete',
      schema: feedbackAdminRemediationParamsSchema,
      handler: async (ctx, clients) => {
        const trusted = requireTrustedActor(ctx);
        return forward(
          clients.feedbackAdmin.completeRemediation(
            ctx.params.entryId,
            trusted.body,
            trustedActorOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/artifacts/review',
      schema: artifactReviewBodySchema,
      handler: async (ctx, clients) => {
        return forward(
          clients.review.reviewArtifact({
            artifactId: ctx.body.artifactId,
            decision: ctx.body.decision,
            actorId: ctx.body.actorId,
            ...(ctx.body.note !== undefined ? { note: ctx.body.note } : {}),
          }),
        );
      },
    }),

    // ---- Job routes (job-runtime) ----

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
