import type { RouteDef } from '@trapmap/backend-core';
import {
  adminActivitySchema,
  adminArtifactDetailSchema,
  adminArtifactListSchema,
  adminManualJsonEditSchema,
  adminReviewDecisionSchema,
  adminReviewDetailSchema,
  adminReviewQueueSchema,
  adminRuntimeOverviewSchema,
  adminSkillGraphByIdSchema,
  adminSkillGraphSchema,
  adminTrapGraphSchema,
  artifactReviewBodySchema,
  bodyWithoutActor,
  feedbackAdminQuerySchema,
  feedbackAdminRemediationParamsSchema,
  feedbackAdminStatsSchema,
  feedbackSchema,
  forward,
  gatewayRouteDef,
  knowledgeActionBodyArgs,
  knowledgeActionSchema,
  queryStringValues,
  requireTrustedActor,
  reviewDecisionSchema,
  reviewQueueSchema,
  trustedActorOptions,
  trustedAdminOptions,
} from './shared.js';

export function createGovernanceRoutes(): RouteDef[] {
  return [
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
            : ctx.body.decision === 'return-for-correction'
              ? clients.review.returnForCorrection(command)
              : clients.review.reject(command),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/knowledge/maintenance',
      schema: knowledgeActionSchema,
      handler: async (ctx, clients) => {
        return forward(
          clients.knowledgeWrite.applyMaintenanceDecision(
            knowledgeActionBodyArgs(ctx),
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
        return forward(
          clients.knowledgeWrite.applyDecayDecision(
            knowledgeActionBodyArgs(ctx),
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

    gatewayRouteDef({
      method: 'GET',
      path: '/v1/knowledge/review-queue',
      schema: reviewQueueSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.reviewQueue.list(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),

    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/reviews',
      schema: adminReviewQueueSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminReview.listReviews(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/reviews/:id',
      schema: adminReviewDetailSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(clients.adminReview.getReview(ctx.params.id, trustedAdminOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/activity',
      schema: adminActivitySchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminReview.listActivity(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/api/admin/reviews/:id/decision',
      schema: adminReviewDecisionSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminReview.decideReview(
            ctx.params.id,
            bodyWithoutActor(ctx.body) as Record<string, unknown>,
            trustedAdminOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/artifacts',
      schema: adminArtifactListSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminArtifacts.list(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/artifacts/:id',
      schema: adminArtifactDetailSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(clients.adminArtifacts.getById(ctx.params.id, trustedAdminOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/graph/traps',
      schema: adminTrapGraphSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminGraph.getTrapGraph(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/graph/skills',
      schema: adminSkillGraphSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminGraph.getSkillGraph(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/graphs/trap',
      schema: adminTrapGraphSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminGraph.getTrapGraph(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/graphs/skill',
      schema: adminSkillGraphSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminGraph.getSkillGraph(queryStringValues(ctx.query), trustedAdminOptions(ctx)),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/graphs/skill/:artifactId',
      schema: adminSkillGraphByIdSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        const query = { ...queryStringValues(ctx.query), artifactId: ctx.params.artifactId };
        return forward(
          clients.adminGraph.getSkillGraphById(
            ctx.params.artifactId,
            query,
            trustedAdminOptions(ctx),
          ),
        );
      },
    }),
    gatewayRouteDef({
      method: 'GET',
      path: '/api/admin/runtime-overview',
      schema: adminRuntimeOverviewSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(clients.adminReview.getRuntimeOverview(trustedAdminOptions(ctx)));
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/api/admin/reviews/:id/json-edits',
      schema: adminManualJsonEditSchema,
      handler: async (ctx, clients) => {
        requireTrustedActor(ctx);
        return forward(
          clients.adminReview.saveJsonEdit(
            ctx.params.id,
            bodyWithoutActor(ctx.body) as Record<string, unknown>,
            trustedAdminOptions(ctx),
          ),
        );
      },
    }),
  ];
}
