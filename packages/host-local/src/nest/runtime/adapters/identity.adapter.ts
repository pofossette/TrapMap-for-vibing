import type {
  AccessKeyRecord,
  AccessKeyRepositoryPort,
  MembershipRecord,
  MembershipRepositoryPort,
  SessionRecord,
  SessionRepositoryPort,
  TeamRecord,
  TeamRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from '@trapmap/backend-core';
import { nowIso } from '@trapmap/lib';

import { normalizeRoleTemplate } from '../auth-context.js';
import type { HostLocalRepos } from '../shared-infra.js';

function normalizeSessionRecord(record: Record<string, unknown>): SessionRecord {
  return {
    id: String(record.id),
    tokenHash: String(record.tokenHash),
    activeTeamId: typeof record.activeTeamId === 'string' ? record.activeTeamId : null,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
    userId: typeof record.userId === 'string' ? record.userId : null,
    subjectType:
      typeof record.subjectType === 'string' && record.subjectType === 'system-admin'
        ? 'system-admin'
        : 'user',
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
  };
}

function normalizeAccessKeyRecord(record: Record<string, unknown>): AccessKeyRecord {
  return {
    id: String(record.id),
    tokenHash: String(record.tokenHash),
    memberId: String(record.memberId),
    tokenPreview: String(record.tokenPreview ?? String(record.tokenHash).slice(0, 12)),
    issuedByUserId: String(record.issuedByUserId ?? 'system'),
    teamId: String(record.teamId ?? 'unknown-team'),
    level: typeof record.level === 'number' ? record.level : 0,
    notes: typeof record.notes === 'string' ? record.notes : null,
    ...(typeof record.revokedAt === 'string' ? { revokedAt: record.revokedAt } : {}),
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
  };
}

function normalizeTeamRecord(record: Record<string, unknown>): TeamRecord {
  return {
    id: String(record.id),
    slug: String(record.slug),
    name: String(record.name ?? record.slug),
    description: typeof record.description === 'string' ? record.description : null,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
  };
}

function normalizeMembershipRecord(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    userId: String(record.userId),
    teamId: String(record.teamId),
    roleTemplate: normalizeRoleTemplate(record.roleTemplate),
    securityLevel: typeof record.securityLevel === 'number' ? record.securityLevel : 0,
    permissions: Array.isArray(record.permissions) ? record.permissions : [],
    notes: typeof record.notes === 'string' ? record.notes : null,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
  };
}

function normalizeUserRecord(record: Record<string, unknown>): UserRecord {
  return {
    id: String(record.id),
    handle: String(record.handle),
    notes: typeof record.notes === 'string' ? record.notes : null,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
  };
}

export function createIdentityAccessRepos(
  repos: Pick<HostLocalRepos, 'session' | 'accessKey' | 'team' | 'membership' | 'user'>,
): {
  sessionRepo: SessionRepositoryPort;
  accessKeyRepo: AccessKeyRepositoryPort;
  teamRepo: TeamRepositoryPort;
  membershipRepo: MembershipRepositoryPort;
  userRepo: UserRepositoryPort;
} {
  return {
    sessionRepo: {
      nextId: () => Promise.resolve(repos.session.nextId()),
      async create(session) {
        const created = await repos.session.create({
          subjectType: 'user',
          userId: typeof session.userId === 'string' ? session.userId : null,
          activeTeamId: typeof session.activeTeamId === 'string' ? session.activeTeamId : null,
          tokenHash: String(session.tokenHash),
          expiresAt: null,
        });
        return normalizeSessionRecord(created);
      },
      async getByTokenHash(tokenHash) {
        const session = await repos.session.getByTokenHash(tokenHash);
        return session ? normalizeSessionRecord(session) : null;
      },
      deleteByTokenHash: (tokenHash) => repos.session.deleteByTokenHash(tokenHash),
      async updateActiveTeam(sessionId, teamId) {
        const session = await repos.session.updateActiveTeam(sessionId, teamId ?? '');
        return normalizeSessionRecord(session);
      },
    },
    accessKeyRepo: {
      nextId: () => Promise.resolve(repos.accessKey.nextId()),
      async insert(key) {
        await repos.accessKey.insert({
          id: key.id,
          memberId: key.memberId,
          tokenHash: key.tokenHash,
          tokenPreview:
            typeof key.tokenPreview === 'string' && key.tokenPreview.length > 0
              ? key.tokenPreview
              : key.tokenHash.slice(0, 12),
          issuedByUserId: typeof key.issuedByUserId === 'string' ? key.issuedByUserId : 'system',
          teamId: typeof key.teamId === 'string' ? key.teamId : 'unknown-team',
          level: typeof key.level === 'number' ? key.level : 0,
          notes: typeof key.notes === 'string' ? key.notes : null,
          revokedAt: typeof key.revokedAt === 'string' ? key.revokedAt : null,
          createdAt: nowIso(),
          updatedAt: typeof key.updatedAt === 'string' ? key.updatedAt : nowIso(),
        });
      },
      async getByTokenHash(tokenHash) {
        const accessKey = await repos.accessKey.getByTokenHash(tokenHash);
        return accessKey ? normalizeAccessKeyRecord(accessKey) : null;
      },
      async getById(keyId) {
        const accessKey = await repos.accessKey.getById(keyId);
        return accessKey ? normalizeAccessKeyRecord(accessKey) : null;
      },
      revoke: (keyId) => repos.accessKey.revoke(keyId),
      async listByMember(memberId) {
        const keys = await repos.accessKey.listByMember(memberId);
        return keys.map((key) => normalizeAccessKeyRecord(key));
      },
    },
    teamRepo: {
      nextId: () => Promise.resolve(repos.team.nextId()),
      async insert(team) {
        await repos.team.insert({
          id: team.id,
          name: typeof team.name === 'string' ? team.name : team.slug,
          slug: team.slug,
          description: typeof team.description === 'string' ? team.description : null,
          createdAt: nowIso(),
          updatedAt: typeof team.updatedAt === 'string' ? team.updatedAt : nowIso(),
        });
      },
      async getById(teamId) {
        const team = await repos.team.getById(teamId);
        return team ? normalizeTeamRecord(team) : null;
      },
      async getBySlug(slug) {
        const team = await repos.team.getBySlug(slug);
        return team ? normalizeTeamRecord(team) : null;
      },
      async listAll() {
        const teams = await repos.team.listAll();
        return teams.map((team) => normalizeTeamRecord(team));
      },
      update: (teamId, updates) => repos.team.update(teamId, updates),
    },
    membershipRepo: {
      nextId: () => Promise.resolve(repos.membership.nextId()),
      async insert(membership) {
        const shape = membership as Record<string, unknown>;
        await repos.membership.insert({
          id: membership.id,
          userId: membership.userId,
          teamId: membership.teamId,
          roleTemplate: normalizeRoleTemplate(shape.role ?? membership.roleTemplate),
          securityLevel:
            typeof membership.securityLevel === 'number' ? membership.securityLevel : 0,
          permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
          notes: typeof membership.notes === 'string' ? membership.notes : null,
          createdAt: nowIso(),
          updatedAt: typeof membership.updatedAt === 'string' ? membership.updatedAt : nowIso(),
        });
      },
      async getById(membershipId) {
        const membership = await repos.membership.getById(membershipId);
        return membership ? (normalizeMembershipRecord(membership) as MembershipRecord) : null;
      },
      async findByUserAndTeam(userId, teamId) {
        const membership = await repos.membership.findByUserAndTeam(userId, teamId);
        return membership ? (normalizeMembershipRecord(membership) as MembershipRecord) : null;
      },
      async listByUser(userId) {
        const memberships = await repos.membership.listByUser(userId);
        return memberships.map(
          (membership) => normalizeMembershipRecord(membership) as MembershipRecord,
        );
      },
      async listByTeam(teamId) {
        const memberships = await repos.membership.listByTeam(teamId);
        return memberships.map(
          (membership) => normalizeMembershipRecord(membership) as MembershipRecord,
        );
      },
      update: (membershipId, updates) => repos.membership.update(membershipId, updates),
    },
    userRepo: {
      nextId: () => Promise.resolve(repos.user.nextId()),
      async insert(user) {
        await repos.user.insert({
          id: user.id,
          handle: user.handle,
          notes: typeof user.notes === 'string' ? user.notes : null,
          createdAt: nowIso(),
          updatedAt: typeof user.updatedAt === 'string' ? user.updatedAt : nowIso(),
        });
      },
      async getById(userId) {
        const user = await repos.user.getById(userId);
        return user ? normalizeUserRecord(user) : null;
      },
      async getByHandle(handle) {
        const user = await repos.user.getByHandle(handle);
        return user ? normalizeUserRecord(user) : null;
      },
      update: (userId, updates) => repos.user.update(userId, updates),
    },
  };
}
