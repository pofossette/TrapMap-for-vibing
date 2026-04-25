import type {
  AccessKey,
  ActiveSession,
  AuthContext,
  Member,
  Permission,
  Team,
} from '@trapmap/contracts';
import {
  accessKeySchema,
  activeSessionSchema,
  authContextSchema,
  memberSchema,
  teamSchema,
} from '@trapmap/contracts';
import type { FastifyRequest } from 'fastify';

import type { ServerConfig } from '../config.js';
import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { getSessionToken } from './context.js';
import { AppError } from './errors.js';
import { resolveEffectivePermissions } from './rbac.js';
import {
  type AccessKeyRecord,
  type MembershipRecord,
  type SessionRecord,
  type SkillShareerStore,
  type StoreData,
  type TeamRecord,
  type UserRecord,
  createOpaqueToken,
  hashSecret,
  nowIso,
} from './store.js';

function toActorRef(
  user: UserRecord,
  membership: MembershipRecord | null,
  permissions: Permission[],
): AuthContext['actor'] {
  return {
    id: user.id,
    handle: user.handle,
    securityLevel: membership?.securityLevel ?? 10,
  };
}

function toTeam(team: TeamRecord | null): Team | null {
  if (!team) {
    return null;
  }

  return teamSchema.parse(team);
}

function toMember(user: UserRecord, membership: MembershipRecord, isSystem = false): Member {
  return memberSchema.parse({
    id: membership.id,
    teamId: membership.teamId,
    handle: user.handle,
    roleTemplate: membership.roleTemplate,
    securityLevel: membership.securityLevel,
    permissions: membership.permissions,
    notes: membership.notes,
    isSystem,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  });
}

function findMembershipForTeam(
  data: StoreData,
  userId: string,
  activeTeamId: string | null,
): MembershipRecord | null {
  const memberships = data.memberships.filter((membership) => membership.userId === userId);

  if (memberships.length === 0) {
    return null;
  }

  if (!activeTeamId) {
    return memberships[0] ?? null;
  }

  return (
    memberships.find((membership) => membership.teamId === activeTeamId) ?? memberships[0] ?? null
  );
}

export async function createSession(
  store: SkillShareerStore,
  subjectType: SessionRecord['subjectType'],
  userId: string | null,
  activeTeamId: string | null,
): Promise<{ record: SessionRecord; token: string }> {
  const token = createOpaqueToken('ssr_sess');
  const tokenHash = hashSecret(token);
  const createdAt = nowIso();

  const record = await store.transact((data) => {
    const sessionRecord: SessionRecord = {
      id: store.nextId(data, 'session'),
      subjectType,
      userId,
      activeTeamId,
      tokenHash,
      expiresAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    data.sessions.push(sessionRecord);

    return sessionRecord;
  });

  return { record, token };
}

export async function deleteSession(store: SkillShareerStore, token: string): Promise<void> {
  const tokenHash = hashSecret(token);

  await store.transact((data) => {
    data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
  });
}

export function issueAccessKeyPayload(
  data: StoreData,
  accessKey: AccessKeyRecord,
  issuer: UserRecord,
  membership: MembershipRecord,
): AccessKey {
  return accessKeySchema.parse({
    id: accessKey.id,
    memberId: accessKey.memberId,
    tokenPreview: accessKey.tokenPreview,
    issuedBy: toActorRef(
      issuer,
      membership,
      resolveEffectivePermissions(membership.roleTemplate, membership.permissions),
    ),
    teamId: accessKey.teamId,
    level: accessKey.level,
    notes: accessKey.notes,
    revokedAt: accessKey.revokedAt,
    createdAt: accessKey.createdAt,
    updatedAt: accessKey.updatedAt,
  });
}

export async function resolveAuthContext(
  services: SkillShareerServices,
  request: FastifyRequest,
): Promise<ResolvedAuthContext> {
  const token = getSessionToken(request);

  if (!token) {
    throw new AppError(401, 'unauthorized', 'A valid session token is required');
  }

  const data = await services.store.snapshot();
  const session = data.sessions.find((candidate) => candidate.tokenHash === hashSecret(token));

  if (!session) {
    throw new AppError(401, 'unauthorized', 'Session not found or expired');
  }

  if (session.subjectType === 'system-admin') {
    const team = session.activeTeamId
      ? (data.teams.find((candidate) => candidate.id === session.activeTeamId) ?? null)
      : null;

    return {
      subjectType: 'system-admin',
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

  const user = data.users.find((candidate) => candidate.id === session.userId);

  if (!user) {
    throw new AppError(401, 'unauthorized', 'Session user no longer exists');
  }

  const membership = findMembershipForTeam(data, user.id, session.activeTeamId);

  if (!membership) {
    throw new AppError(
      403,
      'membership_missing',
      'No team membership is available for this session',
    );
  }

  const team = data.teams.find((candidate) => candidate.id === membership.teamId) ?? null;
  const effectivePermissions = resolveEffectivePermissions(
    membership.roleTemplate,
    membership.permissions,
  );

  return {
    subjectType: 'user',
    actorId: user.id,
    handle: user.handle,
    activeTeamId: membership.teamId,
    securityLevel: membership.securityLevel,
    effectivePermissions,
    user,
    membership,
    team,
  };
}

export async function getSessionResponse(
  services: SkillShareerServices,
  session: SessionRecord,
): Promise<ActiveSession> {
  const data = await services.store.snapshot();

  if (session.subjectType === 'system-admin') {
    const activeTeam = session.activeTeamId
      ? (data.teams.find((candidate) => candidate.id === session.activeTeamId) ?? null)
      : null;
    const issuedAt = session.createdAt;

    return activeSessionSchema.parse({
      sessionId: session.id,
      member: {
        id: 'system-admin',
        teamId: activeTeam?.id ?? 'system-admin',
        handle: 'system-admin',
        roleTemplate: 'system-admin',
        securityLevel: 10,
        permissions: resolveEffectivePermissions('system-admin', []),
        notes: 'Virtual system administrator account',
        isSystem: true,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      activeTeam: activeTeam ? teamSchema.parse(activeTeam) : null,
      effectivePermissions: resolveEffectivePermissions('system-admin', []),
      expiresAt: null,
      issuedAt,
    });
  }

  const user = data.users.find((candidate) => candidate.id === session.userId);

  if (!user) {
    throw new AppError(401, 'unauthorized', 'Session user no longer exists');
  }

  const membership = findMembershipForTeam(data, user.id, session.activeTeamId);

  if (!membership) {
    throw new AppError(403, 'membership_missing', 'No membership available for session');
  }

  const activeTeam = data.teams.find((candidate) => candidate.id === membership.teamId) ?? null;
  const effectivePermissions = resolveEffectivePermissions(
    membership.roleTemplate,
    membership.permissions,
  );

  return activeSessionSchema.parse({
    sessionId: session.id,
    member: toMember(user, membership),
    activeTeam: toTeam(activeTeam),
    effectivePermissions,
    expiresAt: session.expiresAt,
    issuedAt: session.createdAt,
  });
}

export async function getSessionStatus(
  services: SkillShareerServices,
  request: FastifyRequest,
): Promise<ActiveSession | null> {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  const data = await services.store.snapshot();
  const session = data.sessions.find((candidate) => candidate.tokenHash === hashSecret(token));

  return session ? getSessionResponse(services, session) : null;
}

export function requireSystemAdminKey(config: ServerConfig, providedKey: string): void {
  if (!config.systemAdminKey) {
    throw new AppError(
      500,
      'system_admin_not_configured',
      'TRAPMAP_SYSTEM_ADMIN_KEY must be configured for system admin login',
    );
  }

  if (providedKey !== config.systemAdminKey) {
    throw new AppError(401, 'invalid_system_admin_key', 'System admin key is invalid');
  }
}

export function findAccessKeyByToken(
  data: StoreData,
  providedToken: string,
): AccessKeyRecord | null {
  return (
    data.accessKeys.find(
      (record) => record.revokedAt === null && record.tokenHash === hashSecret(providedToken),
    ) ?? null
  );
}
