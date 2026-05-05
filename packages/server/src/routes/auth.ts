import {
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
  selectTeamRequestSchema,
  sessionStatusResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { getSessionToken } from '../lib/context.js';
import { AppError } from '../lib/errors.js';
import { requirePermission } from '../lib/rbac.js';
import {
  createSession,
  deleteSession,
  findAccessKeyByToken,
  findSessionByToken,
  getSessionResponse,
  getSessionStatus,
  requireSystemAdminKey,
  resolveAuthContext,
} from '../lib/session.js';
import type { SessionRecord } from '../lib/store.js';
import { hashSecret, nowIso } from '../lib/store.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/auth/login', async (request, reply) => {
    const payload = loginRequestSchema.parse(request.body);

    if ('systemAdminKey' in payload) {
      requireSystemAdminKey(app.skillShareer.config, payload.systemAdminKey);

      // Use sessionRepo if available, fallback to store
      const { record, token } = await createSession(
        app.skillShareer.sessionRepo ?? app.skillShareer.store,
        'system-admin',
        null,
        null,
      );
      const session = await getSessionResponse(app.skillShareer, record);

      return reply.header('x-session-token', token).send(loginResponseSchema.parse({ session }));
    }

    // Use accessKeyRepo if available, fallback to store snapshot
    const accessKey = app.skillShareer.accessKeyRepo
      ? await findAccessKeyByToken(app.skillShareer.accessKeyRepo, payload.accessKey)
      : await findAccessKeyByToken(await app.skillShareer.store.snapshot(), payload.accessKey);

    if (!accessKey) {
      throw new AppError(401, 'invalid_access_key', 'Access key is invalid or revoked');
    }

    // Get user ID from membership
    const data = await app.skillShareer.store.snapshot();
    const userId =
      data.memberships.find((membership) => membership.id === accessKey.memberId)?.userId ?? null;

    // Use sessionRepo if available, fallback to store
    const { record, token } = await createSession(
      app.skillShareer.sessionRepo ?? app.skillShareer.store,
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
      // Use sessionRepo if available, fallback to store
      await deleteSession(app.skillShareer.sessionRepo ?? app.skillShareer.store, token);
    }

    return logoutResponseSchema.parse({ ok: true });
  });

  app.post('/v1/teams/select', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'team:select');

    const payload = selectTeamRequestSchema.parse(request.body);
    const data = await app.skillShareer.store.snapshot();

    if (
      auth.subjectType !== 'system-admin' &&
      !data.memberships.some(
        (membership) => membership.userId === auth.user?.id && membership.teamId === payload.teamId,
      )
    ) {
      throw new AppError(403, 'team_mismatch', 'Selected team is not available to this session');
    }

    const token = getSessionToken(request);

    if (!token) {
      throw new AppError(401, 'unauthorized', 'A valid session token is required');
    }

    // Use sessionRepo if available, fallback to store.transact
    let updatedSession: SessionRecord | undefined;
    if (app.skillShareer.sessionRepo) {
      const session = await findSessionByToken(app.skillShareer.sessionRepo, token);
      if (!session) {
        throw new AppError(401, 'unauthorized', 'Session not found or expired');
      }
      updatedSession = await app.skillShareer.sessionRepo.updateActiveTeam(
        session.id,
        payload.teamId,
      );
    } else {
      updatedSession = await app.skillShareer.store.transact((storeData) => {
        const sessionRecord = storeData.sessions.find(
          (candidate) => candidate.tokenHash === hashSecret(token),
        );

        if (!sessionRecord) {
          throw new AppError(401, 'unauthorized', 'Session not found or expired');
        }

        sessionRecord.activeTeamId = payload.teamId;
        sessionRecord.updatedAt = nowIso();
        return sessionRecord;
      });
    }

    const session = await getSessionResponse(app.skillShareer, updatedSession);
    return loginResponseSchema.parse({ session });
  });
};
