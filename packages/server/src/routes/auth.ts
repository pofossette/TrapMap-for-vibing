import {
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  selectTeamRequestSchema,
  sessionStatusResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { getSessionToken } from '@trapmap/server/lib/context.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import {
  createSession,
  deleteSession,
  findAccessKeyByToken,
  findSessionByToken,
  getSessionResponse,
  getSessionStatus,
  requireSystemAdminKey,
  resolveAuthContext,
} from '@trapmap/server/lib/session.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/auth/login', async (request, reply) => {
    const payload = loginRequestSchema.parse(request.body);

    if ('systemAdminKey' in payload) {
      requireSystemAdminKey(app.skillShareer.config, payload.systemAdminKey);

      const { record, token } = await createSession(
        app.skillShareer.identity.sessionRepo,
        'system-admin',
        null,
        null,
      );
      const session = await getSessionResponse(app.skillShareer, record);

      return reply.header('x-session-token', token).send(loginResponseSchema.parse({ session }));
    }

    const accessKey = await findAccessKeyByToken(
      app.skillShareer.identity.accessKeyRepo,
      payload.accessKey,
    );

    if (!accessKey) {
      throw new AppError(401, 'invalid_access_key', 'Access key is invalid or revoked');
    }

    const membership = await app.skillShareer.identity.membershipRepo.getById(accessKey.memberId);
    const userId = membership?.userId ?? null;

    const { record, token } = await createSession(
      app.skillShareer.identity.sessionRepo,
      'user',
      userId,
      accessKey.teamId,
    );

    if (!record.userId) {
      throw new AppError(500, 'invalid_access_key_record', 'Access key is not linked to a member');
    }

    const session = await getSessionResponse(app.skillShareer, record);

    return reply.header('x-session-token', token).send(loginResponseSchema.parse({ session }));
  });

  app.get('/v1/auth/session', async (request) => {
    const session = await getSessionStatus(app.skillShareer, request);

    return sessionStatusResponseSchema.parse({
      authenticated: Boolean(session),
      session,
    });
  });

  app.post('/v1/auth/logout', async (request) => {
    const token = getSessionToken(request);

    if (token) {
      await deleteSession(app.skillShareer.identity.sessionRepo, token);
    }

    return logoutResponseSchema.parse({ ok: true });
  });

  app.post('/v1/teams/select', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'team:select');

    const payload = selectTeamRequestSchema.parse(request.body);

    if (auth.subjectType !== 'system-admin') {
      const memberships = await app.skillShareer.identity.membershipRepo.listByUser(auth.actorId);
      if (!memberships.some((m) => m.teamId === payload.teamId)) {
        throw new AppError(403, 'team_mismatch', 'Selected team is not available to this session');
      }
    }

    const token = getSessionToken(request);

    if (!token) {
      throw new AppError(401, 'unauthorized', 'A valid session token is required');
    }

    const session = await findSessionByToken(app.skillShareer.identity.sessionRepo, token);
    if (!session) {
      throw new AppError(401, 'unauthorized', 'Session not found or expired');
    }
    const updatedSession = await app.skillShareer.identity.sessionRepo.updateActiveTeam(
      session.id,
      payload.teamId,
    );

    const result = await getSessionResponse(app.skillShareer, updatedSession);
    return loginResponseSchema.parse({ session: result });
  });
};
