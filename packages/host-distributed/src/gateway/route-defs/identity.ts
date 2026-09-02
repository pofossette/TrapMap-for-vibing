import type { RouteDef } from '@trapmap/backend-core';
import {
  addMemberBodySchema,
  createTeamBodySchema,
  forward,
  gatewayRouteDef,
  listTeamsSchema,
  provisionAccessKeyBodySchema,
  requireTrustedActor,
  selectTeamBodySchema,
  sessionTokenBodySchema,
  updateMemberSchema,
} from './shared.js';

export function createIdentityRoutes(): RouteDef[] {
  return [
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/auth/logout',
      schema: sessionTokenBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.identityAccess.logout(ctx.body));
      },
    }),

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
  ];
}
