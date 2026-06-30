import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

import type { HostLocalServices } from './host-services.js';
import { resolveEffectivePermissions } from './permissions.js';

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function getSessionToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const headerToken = request.headers['x-session-token'];
  return typeof headerToken === 'string' ? headerToken.trim() : null;
}

export async function resolveHostLocalAuthContext(
  services: HostLocalServices,
  request: FastifyRequest,
) {
  const token = getSessionToken(request);

  if (!token) {
    throw new Error('A valid session token is required');
  }

  const session = await services.repos.session.getByTokenHash(hashSecret(token));
  if (!session) {
    throw new Error('Session not found or expired');
  }

  if (session.subjectType === 'system-admin') {
    const team = session.activeTeamId ? await services.repos.team.getById(session.activeTeamId) : null;

    return {
      subjectType: 'system-admin' as const,
      actorId: 'system-admin',
      handle: 'system-admin',
      activeTeamId: session.activeTeamId,
      securityLevel: 10,
      effectivePermissions: resolveEffectivePermissions('system-admin', []),
      user: null,
      membership: null,
      team,
    };
  }

  const user = await services.repos.user.getById(session.userId ?? '');
  if (!user) {
    throw new Error('Session user no longer exists');
  }

  const memberships = await services.repos.membership.listByUser(user.id);
  const membership =
    (session.activeTeamId
      ? memberships.find((candidate) => candidate.teamId === session.activeTeamId)
      : undefined) ??
    memberships[0] ??
    null;

  if (!membership && services.runtimeDeployment.capabilities.supportsLocalSingleUserMode) {
    const team = session.activeTeamId ? await services.repos.team.getById(session.activeTeamId) : null;

    return {
      subjectType: 'user' as const,
      actorId: user.id,
      handle: user.handle,
      activeTeamId: session.activeTeamId,
      securityLevel: Number.MAX_SAFE_INTEGER,
      effectivePermissions: resolveEffectivePermissions('system-admin', []),
      localSingleUserMode: true,
      user,
      membership: null,
      team,
    };
  }

  if (!membership) {
    throw new Error('No team membership is available for this session');
  }

  const team = await services.repos.team.getById(membership.teamId);
  return {
    subjectType: 'user' as const,
    actorId: user.id,
    handle: user.handle,
    activeTeamId: membership.teamId,
    securityLevel: membership.securityLevel,
    effectivePermissions: resolveEffectivePermissions(
      membership.roleTemplate,
      membership.permissions,
    ),
    localSingleUserMode: false,
    user,
    membership,
    team,
  };
}
