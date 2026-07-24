import { createTeamRequestSchema, teamListResponseSchema, teamSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { createSlug, nowIso } from '@trapmap/server/lib/store.js';

export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/teams', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'team:list');

    const { identity } = app.skillShareer;
    const { teamRepo, membershipRepo } = identity;

    if (teamRepo && membershipRepo) {
      const allTeams = await teamRepo.listAll();

      const teams =
        auth.subjectType === 'system-admin'
          ? allTeams
          : await (async () => {
              const userMemberships = await membershipRepo.listByUser(auth.user?.id ?? '');
              const userTeamIds = new Set(userMemberships.map((m) => m.teamId));
              return allTeams.filter((team) => userTeamIds.has(team.id));
            })();

      return teamListResponseSchema.parse({
        teams,
        activeTeamId: auth.activeTeamId,
      });
    }

    throw new AppError(503, 'identity_unavailable', 'Identity owner is unavailable');
  });

  app.post('/v1/teams', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'team:create');

    const payload = createTeamRequestSchema.parse(request.body);
    const createdAt = nowIso();
    const slug = createSlug(payload.name);

    const { identity } = app.skillShareer;
    const { teamRepo, membershipRepo } = identity;

    if (teamRepo && membershipRepo) {
      // Check for duplicate slug
      const existing = await teamRepo.getBySlug(slug);
      if (existing) {
        throw new AppError(409, 'team_exists', 'A team with this name already exists');
      }

      const teamId = await teamRepo.nextId();
      const team = {
        id: teamId,
        name: payload.name,
        slug,
        description: payload.description ?? null,
        createdAt,
        updatedAt: createdAt,
      };

      await teamRepo.insert(team);

      // Create auto-membership for non-system-admin users
      if (auth.subjectType === 'user' && auth.user) {
        const membershipId = await membershipRepo.nextId();
        await membershipRepo.insert({
          id: membershipId,
          userId: auth.user.id,
          teamId: team.id,
          roleTemplate: auth.membership?.roleTemplate ?? 'admin',
          securityLevel: auth.securityLevel,
          permissions: auth.membership?.permissions ?? [],
          notes: auth.membership?.notes ?? null,
          createdAt,
          updatedAt: createdAt,
        });
      }

      return teamSchema.parse(team);
    }

    throw new AppError(503, 'identity_unavailable', 'Identity owner is unavailable');
  });
};
