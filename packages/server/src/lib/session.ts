import type {
  AccessKey,
  ActiveSession,
  AuthContext,
  Member,
  Permission,
  Team,
} from '@trapmap/contracts';
import { accessKeySchema, activeSessionSchema, memberSchema, teamSchema } from '@trapmap/contracts';
import type { FastifyRequest } from 'fastify';

import type { ServerConfig } from '@trapmap/server/config.js';
import type { AccessKeyRepository, SessionRepository } from './auth/index.js';
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

/**
 * Type guard: identifies SkillShareerStore by its unique `snapshot` method.
 * More robust than checking for repository methods (e.g. 'create') which
 * could theoretically be added to the store interface later.
 */
function isSessionStore(obj: SessionRepository | SkillShareerStore): obj is SkillShareerStore {
  return 'snapshot' in obj;
}

/**
 * Type guard: identifies StoreData by its `accessKeys` property.
 * More robust than checking for repository methods which could collide.
 */
function isStoreData(obj: AccessKeyRepository | StoreData): obj is StoreData {
  return 'accessKeys' in obj;
}

function toActorRef(
  user: UserRecord,
  membership: MembershipRecord | null,
  _permissions: Permission[],
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

/**
 * Find the appropriate membership from a list for a given active team.
 */
function findMembershipForTeamFromList(
  memberships: MembershipRecord[],
  activeTeamId: string | null,
): MembershipRecord | null {
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

/**
 * Create a new session using the repository pattern.
 * Uses SessionRepository if provided, falls back to store.transact() for backward compatibility.
 */
export async function createSession(
  repoOrStore: SessionRepository | SkillShareerStore,
  subjectType: SessionRecord['subjectType'],
  userId: string | null,
  activeTeamId: string | null,
): Promise<{ record: SessionRecord; token: string }> {
  const token = createOpaqueToken('ssr_sess');
  const tokenHash = hashSecret(token);

  // Repository path: identified by NOT having store's snapshot method
  if (!isSessionStore(repoOrStore)) {
    const record = await repoOrStore.create({
      subjectType,
      userId,
      activeTeamId,
      tokenHash,
      expiresAt: null,
    });
    return { record, token };
  }

  // Fallback: use store.transact() for backward compatibility
  const createdAt = nowIso();
  const record = await repoOrStore.transact((data) => {
    const sessionRecord: SessionRecord = {
      id: repoOrStore.nextId(data, 'session'),
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

/**
 * Delete a session using the repository pattern.
 * Uses SessionRepository if provided, falls back to store.transact() for backward compatibility.
 */
export async function deleteSession(
  repoOrStore: SessionRepository | SkillShareerStore,
  token: string,
): Promise<void> {
  const tokenHash = hashSecret(token);

  // Repository path: identified by NOT having store's snapshot method
  if (!isSessionStore(repoOrStore)) {
    await repoOrStore.deleteByTokenHash(tokenHash);
    return;
  }

  // Fallback: use store.transact() for backward compatibility
  await repoOrStore.transact((data) => {
    data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
  });
}

/**
 * Find a session by token using the repository pattern.
 * Uses SessionRepository if provided, falls back to store snapshot for backward compatibility.
 */
export async function findSessionByToken(
  repoOrStore: SessionRepository | SkillShareerStore,
  token: string,
): Promise<SessionRecord | null> {
  const tokenHash = hashSecret(token);

  // Repository path: identified by NOT having store's snapshot method
  if (!isSessionStore(repoOrStore)) {
    return repoOrStore.getByTokenHash(tokenHash);
  }

  // Fallback: use store snapshot for backward compatibility
  const data = await repoOrStore.snapshot();
  return data.sessions.find((candidate) => candidate.tokenHash === tokenHash) ?? null;
}

export function issueAccessKeyPayload(
  _data: StoreData,
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

  const { identity } = services;

  const session = await identity.sessionRepo.getByTokenHash(hashSecret(token));

  if (!session) {
    throw new AppError(401, 'unauthorized', 'Session not found or expired');
  }

  if (session.subjectType === 'system-admin') {
    const team = session.activeTeamId
      ? await identity.teamRepo.getById(session.activeTeamId)
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

  const user = await identity.userRepo.getById(session.userId ?? '');

  if (!user) {
    throw new AppError(401, 'unauthorized', 'Session user no longer exists');
  }

  const memberships = await identity.membershipRepo.listByUser(user.id);
  const membership = findMembershipForTeamFromList(memberships, session.activeTeamId);

  if (!membership && services.runtimeDeployment.capabilities.supportsLocalSingleUserMode) {
    const team = session.activeTeamId
      ? await identity.teamRepo.getById(session.activeTeamId)
      : null;

    return {
      subjectType: 'user',
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
    throw new AppError(
      403,
      'membership_missing',
      'No team membership is available for this session',
    );
  }

  const team = await identity.teamRepo.getById(membership.teamId);
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
    localSingleUserMode: false,
    user,
    membership,
    team,
  };
}

export async function getSessionResponse(
  services: SkillShareerServices,
  session: SessionRecord,
): Promise<ActiveSession> {
  const { identity } = services;

  if (session.subjectType === 'system-admin') {
    const activeTeam = session.activeTeamId
      ? await identity.teamRepo.getById(session.activeTeamId)
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

  const user = await identity.userRepo.getById(session.userId ?? '');

  if (!user) {
    throw new AppError(401, 'unauthorized', 'Session user no longer exists');
  }

  const memberships = await identity.membershipRepo.listByUser(user.id);
  const membership = findMembershipForTeamFromList(memberships, session.activeTeamId);

  if (!membership) {
    throw new AppError(403, 'membership_missing', 'No membership available for session');
  }

  const activeTeam = await identity.teamRepo.getById(membership.teamId);
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

  const { identity } = services;

  const session = await identity.sessionRepo.getByTokenHash(hashSecret(token));
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

/**
 * Find an access key by token using either repository or store data.
 * Uses AccessKeyRepository if provided, falls back to StoreData for backward compatibility.
 */
export async function findAccessKeyByToken(
  repoOrData: AccessKeyRepository | StoreData,
  providedToken: string,
): Promise<AccessKeyRecord | null> {
  const tokenHash = hashSecret(providedToken);

  // Repository path: identified by NOT having StoreData's accessKeys property
  if (!isStoreData(repoOrData)) {
    const key = await repoOrData.getByTokenHash(tokenHash);
    // Return null if revoked
    return key?.revokedAt === null ? key : null;
  }

  // Fallback: use StoreData for backward compatibility
  return (
    repoOrData.accessKeys.find(
      (record) => record.revokedAt === null && record.tokenHash === tokenHash,
    ) ?? null
  );
}
