import type { RouteDef } from '@trapmap/backend-core';
import {
  candidateListSchema,
  candidateManualResultSchema,
  candidateParamsSchema,
  candidateResolutionSchema,
  candidateSubmitSchema,
  forward,
  gatewayRouteDef,
  requireTrustedActor,
  trustedActorOptions,
} from './shared.js';

export function createCandidateRoutes(): RouteDef[] {
  return [
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
  ];
}
