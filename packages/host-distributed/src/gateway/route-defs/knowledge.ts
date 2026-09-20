import type { RouteDef } from '@trapmap/backend-core';
import { z } from 'zod';
import {
  actorHeadersSchema,
  artifactActivateSchema,
  artifactExportSchema,
  artifactIdParamsSchema,
  artifactImportSchema,
  artifactReviewSchema,
  bodyWithoutActor,
  createTrapSchema,
  emptyRecord,
  entryMutationSchema,
  entryParamsSchema,
  forward,
  gatewayRouteDef,
  knowledgeSubmitSchema,
  listTrapsSchema,
  mineQuerySchema,
  requireTrustedActor,
  capsuleSearchBodySchema,
  graphPlanSearchBodySchema,
  searchBodyArgs,
  searchBodySchema,
  skillLookupArgs,
  skillLookupBodySchema,
  supersedeSchema,
  trapParamsSchema,
  trustedActorOptions,
  trustedArtifactImportOptions,
} from './shared.js';

export function createKnowledgeRoutes(): RouteDef[] {
  return [
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

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/search',
      schema: searchBodySchema,
      handler: async (ctx, clients) => {
        // `variant` / `latencyEndpoint` are set after the body spread so a
        // client cannot pick a pipeline or forge a metric label.
        return forward(
          clients.knowledgeRead.search({
            ...searchBodyArgs(ctx),
            latencyEndpoint: 'v1-search',
          }),
        );
      },
    }),
    // Capsule-native pipeline: different pool, different channels, different
    // response shape than v1 — see docs/architecture/components/RETRIEVAL.md.
    gatewayRouteDef({
      method: 'POST',
      path: '/v2/retrieval/search',
      schema: capsuleSearchBodySchema,
      handler: async (ctx, clients) => {
        const body = ctx.body as { seed: string; maxResults?: number };
        return forward(
          clients.knowledgeRead.searchCapsules({
            query: body.seed,
            ...(body.maxResults !== undefined ? { limit: body.maxResults } : {}),
            latencyEndpoint: 'v2-capsule',
          }),
        );
      },
    }),
    // v3 is a genuinely separate pipeline: trap-first graph-plan compilation
    // with a governed fallback, returning `GraphPlanSearchResponse` — the shape
    // `trapmap load` and the retrieval eval consume.
    gatewayRouteDef({
      method: 'POST',
      path: '/v3/retrieval/search',
      schema: graphPlanSearchBodySchema,
      handler: async (ctx, clients) => {
        const body = ctx.body as {
          seed: string;
          skillBudget?: number;
          maxDepth?: number;
          fallbackMode?: 'auto' | 'v2-capsule' | 'v1-graph-assisted';
        };
        return forward(
          clients.knowledgeRead.searchGraphPlan({
            seed: body.seed,
            ...(body.skillBudget !== undefined ? { skillBudget: body.skillBudget } : {}),
            ...(body.maxDepth !== undefined ? { maxDepth: body.maxDepth } : {}),
            ...(body.fallbackMode !== undefined ? { fallbackMode: body.fallbackMode } : {}),
            latencyEndpoint: 'v3-graph-plan',
          }),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/skills/search-by-content',
      schema: skillLookupBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.knowledgeRead.searchByContent(skillLookupArgs(ctx)));
      },
    }),
  ];
}
