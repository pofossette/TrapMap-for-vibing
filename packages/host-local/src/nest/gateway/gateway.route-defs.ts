/**
 * Host-local external gateway surface as framework-neutral RouteDefs.
 *
 * The gateway module serves the client-facing `/v1` routes. Handlers are
 * thin transport bindings over the backend-core ports (the same ports the
 * context modules provide) plus the host runtime for cross-context reads.
 * Handlers throw on error; the host's global exception filter maps to the
 * canonical envelope. Authentication stays in the AuthGuard layer — every
 * route below requires a session, and handlers read the resolved auth
 * context from the adapter-enriched RouteContext.
 */

import {
  type HttpMethod,
  InvocationError,
  type RouteContext,
  type RouteDef,
} from '@trapmap/backend-core';
import type { CandidateIngestionPort, KnowledgeReadPort, ReviewPort } from '@trapmap/backend-core';
import {
  ManualResultSubmissionSchema,
  cronJobCreateInputSchema,
  cronJobUpdateInputSchema,
  manualResultResponseSchema,
  reviewDecisionRequestSchema,
  reviewQueueResponseSchema,
} from '@trapmap/contracts';
import { buildOwnerReviewQueueProjection } from '@trapmap/service-governance-review';
import type { CronServiceModule } from '@trapmap/service-cron';
import {
  knowledgeReadMineSchema,
  knowledgeReadSearchSchema,
  toKnowledgeReadSearchArgs,
} from '@trapmap/service-knowledge-read';
import { type ZodType, z } from 'zod';

import type { resolveHostLocalAuthContext } from '../runtime/auth-context.js';
import type { HostLocalRuntime } from '../runtime/host-runtime.js';

type GatewayAuthContext = Awaited<ReturnType<typeof resolveHostLocalAuthContext>>;

export interface GatewayRouteDeps {
  knowledgeRead: KnowledgeReadPort;
  candidateIngestion: CandidateIngestionPort;
  governanceReview: ReviewPort;
  cron: CronServiceModule;
  runtime: HostLocalRuntime;
}

interface GatewayRouteContext extends RouteContext {
  authContext?: GatewayAuthContext;
}

const emptyRecord = z.record(z.string(), z.unknown());
/**
 * The AuthGuard runs before every route below, so the schema requires the
 * auth context field; the adapter injects it from the request. 401 stays in
 * the guard layer (裁决 b), so handlers never re-check it.
 */
const authContextSchema = z.custom<GatewayAuthContext>();

const entryParamsSchema = z.object({
  params: z.object({ entryId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
  authContext: authContextSchema,
});

const candidateParamsSchema = z.object({
  params: z.object({ candidateId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
  authContext: authContextSchema,
});

const manualResultSchema = z.object({
  params: z.object({ candidateId: z.string() }),
  query: emptyRecord,
  body: ManualResultSubmissionSchema,
  authContext: authContextSchema,
});

const reviewQueueSchema = z.object({
  params: emptyRecord,
  query: z.object({ status: z.string().optional() }),
  body: z.unknown(),
  authContext: authContextSchema,
});

const reviewDecisionSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: reviewDecisionRequestSchema,
  authContext: authContextSchema,
});

const cronJobListSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: z.unknown(),
  authContext: authContextSchema,
});

const cronJobParamsSchema = z.object({
  params: z.object({ jobId: z.string() }),
  query: emptyRecord,
  body: z.unknown(),
  authContext: authContextSchema,
});

const cronJobCreateSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  body: cronJobCreateInputSchema,
  authContext: authContextSchema,
});

const cronJobUpdateSchema = z.object({
  params: z.object({ jobId: z.string() }),
  query: emptyRecord,
  body: cronJobUpdateInputSchema,
  authContext: authContextSchema,
});

function reviewDecisionInput(
  ctx: GatewayRouteContext,
  actorId: string,
): {
  actorId: string;
  entryId: string;
  evidence?: Record<string, unknown>;
  note?: string;
} {
  const body = ctx.body as {
    entryId: string;
    evidence?: Record<string, unknown>;
    notes?: string;
  };
  return {
    entryId: body.entryId,
    actorId,
    ...(body.notes ? { note: body.notes } : {}),
    ...(body.evidence ? { evidence: body.evidence } : {}),
  };
}

/**
 * The AuthGuard guarantees the auth context on guarded routes, so handlers
 * read `ctx.authContext` directly — 401 never enters the handler layer.
 */
function gatewayRouteDef<Ctx extends GatewayRouteContext>(def: {
  method: HttpMethod;
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: GatewayRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, GatewayRouteDeps> {
  return def;
}

export function createGatewayRouteDefs(_deps: GatewayRouteDeps): RouteDef[] {
  return [
    gatewayRouteDef({
      method: 'GET',
      path: '/v1/knowledge/:entryId',
      schema: entryParamsSchema,
      handler: async (ctx, deps) => {
        const entry = await deps.knowledgeRead.getById(ctx.params.entryId);
        if (!entry) {
          throw InvocationError.notFound('Knowledge entry not found');
        }
        return entry;
      },
    }),

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/knowledge/mine',
      schema: knowledgeReadMineSchema,
      handler: async (ctx, deps) => {
        const query = ctx.query as { teamId?: string; userId: string };
        return deps.knowledgeRead.listMine(query.userId, query.teamId);
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/search',
      schema: knowledgeReadSearchSchema,
      successStatus: 200,
      handler: async (ctx, deps) => {
        return deps.knowledgeRead.search(
          toKnowledgeReadSearchArgs(ctx.body as Parameters<typeof toKnowledgeReadSearchArgs>[0]),
        );
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
      handler: async (_ctx, deps) => {
        return deps.knowledgeRead.getProjectionStatus();
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/candidates/:candidateId/manual-result',
      schema: manualResultSchema,
      successStatus: 200,
      handler: async (ctx, deps) => {
        const auth = ctx.authContext;
        await deps.candidateIngestion.submitManualResult(
          ctx.params.candidateId,
          {
            decision: ctx.body.decision,
            notes: ctx.body.notes,
            ...(ctx.body.mergedWith !== undefined ? { mergedWith: ctx.body.mergedWith } : {}),
          },
          auth.actorId,
        );
        return manualResultResponseSchema.parse({
          candidateId: ctx.params.candidateId,
          decision: ctx.body.decision,
          reviewedAt: new Date().toISOString(),
          reviewedBy: auth.actorId,
          nextState: ctx.body.decision === 'independent' ? 'ready_for_review' : 'rejected',
        });
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/candidates/:candidateId/apply-resolution',
      schema: candidateParamsSchema,
      successStatus: 200,
      handler: async (ctx, deps) => {
        const auth = ctx.authContext;
        const candidate = await deps.candidateIngestion.getById(ctx.params.candidateId);
        if (!candidate?.manualResult) {
          return {
            candidateId: ctx.params.candidateId,
            status: candidate?.status ?? 'missing',
            outcome: null,
          };
        }

        await deps.candidateIngestion.applyResolution(
          ctx.params.candidateId,
          candidate.manualResult,
          auth.actorId,
        );

        const resolvedCandidate = await deps.candidateIngestion.getById(ctx.params.candidateId);

        return {
          candidateId: ctx.params.candidateId,
          status: resolvedCandidate?.status ?? 'resolved',
          outcome: candidate.manualResult,
        };
      },
    }),

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/knowledge/review-queue',
      schema: reviewQueueSchema,
      handler: async (ctx, deps) => {
        const auth = ctx.authContext;
        const projection = await buildOwnerReviewQueueProjection(
          deps.runtime.services.knowledgeOwner,
          ctx.query.status !== undefined ? { auth, status: ctx.query.status } : { auth },
        );
        return reviewQueueResponseSchema.parse({
          items: projection.items,
          nextCursor: null,
          total: projection.total,
        });
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge/review',
      schema: reviewDecisionSchema,
      successStatus: 200,
      handler: async (ctx, deps) => {
        const auth = ctx.authContext;
        const input = reviewDecisionInput(ctx, auth.actorId);
        const result =
          ctx.body.decision === 'approve'
            ? await deps.governanceReview.approve(input)
            : await deps.governanceReview.reject(input);

        const entry = await deps.runtime.services.knowledgeOwner.getById(result.entryId);

        return {
          entry: entry ?? {
            id: result.entryId,
            lifecycleState: result.lifecycleState,
          },
        };
      },
    }),

    // ---- Cron routes (cron bounded context) ----
    //
    // The monolith serves the cron management surface as session-guarded
    // `/v1/cron/*` gateway routes over the cron service module port — the
    // service package's own RouteDefs gate on a client-supplied
    // `x-trapmap-actor-id` which the monolith cannot verify, so they are
    // not mounted on the public port (mirrors the distributed gateway).

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/jobs',
      schema: cronJobListSchema,
      handler: async (_ctx, deps) => {
        return deps.cron.list();
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/cron/jobs',
      schema: cronJobCreateSchema,
      successStatus: 201,
      handler: async (ctx, deps) => {
        return deps.cron.create(ctx.body);
      },
    }),

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobParamsSchema,
      handler: async (ctx, deps) => {
        const job = await deps.cron.getById(ctx.params.jobId);
        if (!job) {
          throw InvocationError.notFound('Cron job not found');
        }
        return job;
      },
    }),

    gatewayRouteDef({
      method: 'PATCH',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobUpdateSchema,
      handler: async (ctx, deps) => {
        const job = await deps.cron.update(ctx.params.jobId, ctx.body);
        if (!job) {
          throw InvocationError.notFound('Cron job not found');
        }
        return job;
      },
    }),

    gatewayRouteDef({
      method: 'DELETE',
      path: '/v1/cron/jobs/:jobId',
      schema: cronJobParamsSchema,
      handler: async (ctx, deps) => {
        const deleted = await deps.cron.delete(ctx.params.jobId);
        if (!deleted) {
          throw InvocationError.notFound('Cron job not found');
        }
        return { ok: true };
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/cron/jobs/:jobId/trigger',
      schema: cronJobParamsSchema,
      handler: async (ctx, deps) => {
        return deps.cron.trigger(ctx.params.jobId);
      },
    }),

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/cron/status',
      schema: cronJobListSchema,
      handler: async (_ctx, deps) => {
        return deps.cron.statusSnapshots();
      },
    }),
  ];
}
