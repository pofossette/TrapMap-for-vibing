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

import { InvocationError, type RouteDef } from '@trapmap/backend-core';
import {
  ManualResultSubmissionSchema,
  manualResultResponseSchema,
  reviewDecisionRequestSchema,
  reviewQueueResponseSchema,
  skillLookupQuerySchema,
} from '@trapmap/contracts';
import { buildOwnerReviewQueueProjection } from '@trapmap/service-governance-review';
import {
  knowledgeReadMineSchema,
  knowledgeReadSearchSchema,
  toKnowledgeReadSearchArgs,
} from '@trapmap/service-knowledge-read';
import { z } from 'zod';

import { createCronGatewayRouteDefs } from './gateway.cron-route-defs.js';
import {
  type GatewayRouteContext,
  type GatewayRouteDeps,
  authContextSchema,
  emptyRecord,
  gatewayRouteDef,
} from './gateway.route-kit.js';

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

export function createGatewayRouteDefs(deps: GatewayRouteDeps): RouteDef[] {
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
      method: 'POST',
      path: '/v1/retrieval/skills/search-by-content',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        body: skillLookupQuerySchema,
        authContext: authContextSchema,
      }),
      successStatus: 200,
      handler: async (ctx, deps) => {
        return deps.knowledgeRead.skillLookup({
          text: ctx.body.text,
          maxResults: ctx.body.maxResults,
          ...(ctx.authContext?.activeTeamId ? { teamId: ctx.authContext.activeTeamId } : {}),
        });
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
    ...createCronGatewayRouteDefs(deps),
  ];
}
