import { issueAccessKeyRequestSchema, issueAccessKeyResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '@trapmap/server/lib/errors.js';
import {
  requireHigherLevel,
  requirePermission,
  requireTeamAccess,
} from '@trapmap/server/lib/rbac.js';
import { issueAccessKeyPayload, resolveAuthContext } from '@trapmap/server/lib/session.js';
import { createOpaqueToken, hashSecret, nowIso } from '@trapmap/server/lib/store.js';

export const accessKeyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/access-keys', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'member:key:create');

    const payload = issueAccessKeyRequestSchema.parse(request.body);
    const accessKey = createOpaqueToken('ssr_key');
    const createdAt = nowIso();

    const issuer = auth.user ?? {
      id: 'system-admin',
      handle: 'system-admin',
      notes: null,
      createdAt,
      updatedAt: createdAt,
    };

    const issuerMembership = auth.membership ?? {
      id: 'system-admin-member',
      userId: issuer.id,
      teamId: payload.teamId,
      roleTemplate: 'system-admin' as const,
      securityLevel: 10,
      permissions: [],
      notes: 'virtual system admin',
      createdAt,
      updatedAt: createdAt,
    };

    const { identity, store } = app.skillShareer;
    const { membershipRepo, accessKeyRepo } = identity;

    // Use repositories if available
    if (membershipRepo && accessKeyRepo) {
      const membership = await membershipRepo.getById(payload.memberId);

      if (!membership) {
        throw new AppError(404, 'member_not_found', 'Member not found');
      }

      if (membership.teamId !== payload.teamId) {
        throw new AppError(
          400,
          'team_member_mismatch',
          'Member does not belong to the requested team',
        );
      }

      requireTeamAccess(auth, payload.teamId);
      requireHigherLevel(auth, membership.securityLevel);

      const keyId = await accessKeyRepo.nextId();
      const record = {
        id: keyId,
        memberId: membership.id,
        tokenHash: hashSecret(accessKey),
        tokenPreview: accessKey.slice(-8),
        issuedByUserId: issuer.id,
        teamId: payload.teamId,
        level: membership.securityLevel,
        notes: payload.notes ?? null,
        revokedAt: null,
        createdAt,
        updatedAt: createdAt,
      };

      await accessKeyRepo.insert(record);

      return issueAccessKeyResponseSchema.parse({
        accessKey,
        record: issueAccessKeyPayload(null as never, record, issuer, issuerMembership),
      });
    }

    // Fallback: use store.transact()
    const response = await store.transact((data) => {
      const membership = data.memberships.find((candidate) => candidate.id === payload.memberId);

      if (!membership) {
        throw new AppError(404, 'member_not_found', 'Member not found');
      }

      if (membership.teamId !== payload.teamId) {
        throw new AppError(
          400,
          'team_member_mismatch',
          'Member does not belong to the requested team',
        );
      }

      requireTeamAccess(auth, payload.teamId);
      requireHigherLevel(auth, membership.securityLevel);

      const record = {
        id: store.nextId(data, 'access_key'),
        memberId: membership.id,
        tokenHash: hashSecret(accessKey),
        tokenPreview: accessKey.slice(-8),
        issuedByUserId: issuer.id,
        teamId: payload.teamId,
        level: membership.securityLevel,
        notes: payload.notes ?? null,
        revokedAt: null,
        createdAt,
        updatedAt: createdAt,
      };

      data.accessKeys.push(record);

      return issueAccessKeyResponseSchema.parse({
        accessKey,
        record: issueAccessKeyPayload(data, record, issuer, issuerMembership),
      });
    });

    return response;
  });
};
