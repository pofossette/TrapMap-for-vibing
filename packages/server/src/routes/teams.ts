import { createTeamRequestSchema, teamListResponseSchema, teamSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { requirePermission } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { createSlug, nowIso } from '../lib/store.js';

export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/teams', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'team:list');

    const data = await app.skillShareer.store.snapshot();
    const teams =
      auth.subjectType === 'system-admin'
        ? data.teams
        : data.teams.filter((team) =>
            data.memberships.some(
              (membership) => membership.userId === auth.user?.id && membership.teamId === team.id,
            ),
          );

    return teamListResponseSchema.parse({
      teams,
      activeTeamId: auth.activeTeamId,
    });
  });

  app.post('/v1/teams', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'team:create');

    const payload = createTeamRequestSchema.parse(request.body);
    const createdAt = nowIso();

    const team = await app.skillShareer.store.transact((data) => {
      const slug = createSlug(payload.name);

      if (data.teams.some((candidate) => candidate.slug === slug)) {
        throw new AppError(409, 'team_exists', 'A team with this name already exists');
      }

      const record = {
        id: app.skillShareer.store.nextId(data, 'team'),
        name: payload.name,
        slug,
        description: payload.description ?? null,
        createdAt,
        updatedAt: createdAt,
      };

      data.teams.push(record);

      if (auth.subjectType === 'user' && auth.user) {
        data.memberships.push({
          id: app.skillShareer.store.nextId(data, 'member'),
          userId: auth.user.id,
          teamId: record.id,
          roleTemplate: auth.membership?.roleTemplate ?? 'admin',
          securityLevel: auth.securityLevel,
          permissions: auth.membership?.permissions ?? [],
          notes: auth.membership?.notes ?? null,
          createdAt,
          updatedAt: createdAt,
        });
      }

      return record;
    });

    return teamSchema.parse(team);
  });
};
