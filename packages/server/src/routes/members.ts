import {
  createMemberRequestSchema,
  memberSchema,
  updateMemberRequestSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { requireHigherLevel, requirePermission, requireTeamAccess } from '../lib/rbac.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';

export const memberRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/members', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'member:create');

    const payload = createMemberRequestSchema.parse(request.body);
    requireTeamAccess(auth, payload.teamId);

    const createdAt = nowIso();

    const member = await app.skillShareer.store.transact((data) => {
      if (!data.teams.some((team) => team.id === payload.teamId)) {
        throw new AppError(404, 'team_not_found', 'Team not found');
      }

      if (data.users.some((user) => user.handle === payload.handle)) {
        throw new AppError(409, 'handle_exists', 'A user with this handle already exists');
      }

      const user = {
        id: app.skillShareer.store.nextId(data, 'user'),
        handle: payload.handle,
        notes: payload.notes ?? null,
        createdAt,
        updatedAt: createdAt,
      };

      data.users.push(user);

      const membership = {
        id: app.skillShareer.store.nextId(data, 'member'),
        userId: user.id,
        teamId: payload.teamId,
        roleTemplate: payload.roleTemplate,
        securityLevel: 0,
        permissions: payload.permissions,
        notes: payload.notes ?? null,
        createdAt,
        updatedAt: createdAt,
      };

      data.memberships.push(membership);

      return {
        ...membership,
        handle: user.handle,
        isSystem: false,
      };
    });

    return memberSchema.parse(member);
  });

  app.patch('/v1/members/:memberId', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'member:update');

    const memberId = (request.params as { memberId: string }).memberId;
    const payload = updateMemberRequestSchema.parse({
      ...((request.body as Record<string, unknown>) ?? {}),
      memberId,
    });

    const updatedMember = await app.skillShareer.store.transact((data) => {
      const membership = data.memberships.find((candidate) => candidate.id === payload.memberId);

      if (!membership) {
        throw new AppError(404, 'member_not_found', 'Member not found');
      }

      requireTeamAccess(auth, membership.teamId);
      requireHigherLevel(
        auth,
        membership.securityLevel,
        payload.securityLevel ?? membership.securityLevel,
      );

      membership.securityLevel = payload.securityLevel ?? membership.securityLevel;
      membership.permissions = payload.permissions ?? membership.permissions;
      membership.notes = payload.notes ?? membership.notes;
      membership.updatedAt = nowIso();

      const user = data.users.find((candidate) => candidate.id === membership.userId);

      if (!user) {
        throw new AppError(404, 'user_not_found', 'Linked user not found');
      }

      return {
        ...membership,
        handle: user.handle,
        isSystem: false,
      };
    });

    return memberSchema.parse(updatedMember);
  });
};
