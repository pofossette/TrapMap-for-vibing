import type {
  AccessKeyRepositoryPort,
  AuditLogPort,
  MembershipRepositoryPort,
  QueuePorts,
  SessionRepositoryPort,
  TeamRepositoryPort,
  UserRepositoryPort,
} from '@trapmap/backend-core';
import type { RoleTemplate } from '@trapmap/contracts';
import { nowIso } from '@trapmap/lib';

import type { HostLocalAsyncTransport, HostLocalRepos } from './shared-infra.js';

function normalizeRoleTemplate(role: unknown): RoleTemplate {
  if (role === 'admin' || role === 'system-admin') {
    return role;
  }
  return 'user';
}

function normalizeSessionRecord(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    tokenHash: String(record.tokenHash),
    activeTeamId: typeof record.activeTeamId === 'string' ? record.activeTeamId : null,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
    userId: typeof record.userId === 'string' ? record.userId : null,
    subjectType: record.subjectType === 'system-admin' ? 'system-admin' : 'user',
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
  };
}

function normalizeAccessKeyRecord(record: Record<string, unknown>) {
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

function normalizeTeamRecord(record: Record<string, unknown>) {
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

function normalizeUserRecord(record: Record<string, unknown>) {
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
        return normalizeSessionRecord(created as unknown as Record<string, unknown>) as Awaited<
          ReturnType<SessionRepositoryPort['create']>
        >;
      },
      async getByTokenHash(tokenHash) {
        const session = await repos.session.getByTokenHash(tokenHash);
        return session
          ? (normalizeSessionRecord(session as unknown as Record<string, unknown>) as Awaited<
              ReturnType<SessionRepositoryPort['getByTokenHash']>
            >)
          : null;
      },
      deleteByTokenHash: (tokenHash) => repos.session.deleteByTokenHash(tokenHash),
      async updateActiveTeam(sessionId, teamId) {
        const session = await repos.session.updateActiveTeam(sessionId, teamId ?? '');
        return normalizeSessionRecord(session as unknown as Record<string, unknown>) as Awaited<
          ReturnType<SessionRepositoryPort['updateActiveTeam']>
        >;
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
        } as Parameters<HostLocalRepos['accessKey']['insert']>[0]);
      },
      async getByTokenHash(tokenHash) {
        const accessKey = await repos.accessKey.getByTokenHash(tokenHash);
        return accessKey
          ? (normalizeAccessKeyRecord(accessKey as unknown as Record<string, unknown>) as Awaited<
              ReturnType<AccessKeyRepositoryPort['getByTokenHash']>
            >)
          : null;
      },
      async getById(keyId) {
        const accessKey = await repos.accessKey.getById(keyId);
        return accessKey
          ? (normalizeAccessKeyRecord(accessKey as unknown as Record<string, unknown>) as Awaited<
              ReturnType<AccessKeyRepositoryPort['getById']>
            >)
          : null;
      },
      revoke: (keyId) => repos.accessKey.revoke(keyId),
      async listByMember(memberId) {
        const keys = await repos.accessKey.listByMember(memberId);
        return keys.map((key) =>
          normalizeAccessKeyRecord(key as unknown as Record<string, unknown>),
        ) as Awaited<ReturnType<AccessKeyRepositoryPort['listByMember']>>;
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
        } as Parameters<HostLocalRepos['team']['insert']>[0]);
      },
      async getById(teamId) {
        const team = await repos.team.getById(teamId);
        return team
          ? (normalizeTeamRecord(team as unknown as Record<string, unknown>) as Awaited<
              ReturnType<TeamRepositoryPort['getById']>
            >)
          : null;
      },
      async getBySlug(slug) {
        const team = await repos.team.getBySlug(slug);
        return team
          ? (normalizeTeamRecord(team as unknown as Record<string, unknown>) as Awaited<
              ReturnType<TeamRepositoryPort['getBySlug']>
            >)
          : null;
      },
      async listAll() {
        const teams = await repos.team.listAll();
        return teams.map((team) =>
          normalizeTeamRecord(team as unknown as Record<string, unknown>),
        ) as Awaited<ReturnType<TeamRepositoryPort['listAll']>>;
      },
      update: (teamId, updates) => repos.team.update(teamId, updates as never),
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
        } as Parameters<HostLocalRepos['membership']['insert']>[0]);
      },
      async getById(membershipId) {
        const membership = await repos.membership.getById(membershipId);
        return membership
          ? (normalizeMembershipRecord(membership as unknown as Record<string, unknown>) as Awaited<
              ReturnType<MembershipRepositoryPort['getById']>
            >)
          : null;
      },
      async findByUserAndTeam(userId, teamId) {
        const membership = await repos.membership.findByUserAndTeam(userId, teamId);
        return membership
          ? (normalizeMembershipRecord(membership as unknown as Record<string, unknown>) as Awaited<
              ReturnType<MembershipRepositoryPort['findByUserAndTeam']>
            >)
          : null;
      },
      async listByUser(userId) {
        const memberships = await repos.membership.listByUser(userId);
        return memberships.map((membership) =>
          normalizeMembershipRecord(membership as unknown as Record<string, unknown>),
        ) as Awaited<ReturnType<MembershipRepositoryPort['listByUser']>>;
      },
      async listByTeam(teamId) {
        const memberships = await repos.membership.listByTeam(teamId);
        return memberships.map((membership) =>
          normalizeMembershipRecord(membership as unknown as Record<string, unknown>),
        ) as Awaited<ReturnType<MembershipRepositoryPort['listByTeam']>>;
      },
      update: (membershipId, updates) => repos.membership.update(membershipId, updates as never),
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
        } as Parameters<HostLocalRepos['user']['insert']>[0]);
      },
      async getById(userId) {
        const user = await repos.user.getById(userId);
        return user
          ? (normalizeUserRecord(user as unknown as Record<string, unknown>) as Awaited<
              ReturnType<UserRepositoryPort['getById']>
            >)
          : null;
      },
      async getByHandle(handle) {
        const user = await repos.user.getByHandle(handle);
        return user
          ? (normalizeUserRecord(user as unknown as Record<string, unknown>) as Awaited<
              ReturnType<UserRepositoryPort['getByHandle']>
            >)
          : null;
      },
      update: (userId, updates) => repos.user.update(userId, updates as never),
    },
  };
}

export function createAuditLogPort(repos: Pick<HostLocalRepos, 'audit'>): AuditLogPort {
  return {
    async record(entry) {
      const id = await repos.audit.nextId();
      const timestamp = entry.timestamp ?? nowIso();
      await repos.audit.insert({
        id,
        teamId: entry.teamId ?? null,
        actorId: entry.actorId,
        action: entry.action,
        entityId: entry.entityId ?? '',
        payload: entry.metadata ?? {},
        eventVersion: entry.eventVersion ?? 1,
        sourceService: entry.sourceService ?? 'host-local',
        ...(entry.requestId ? { requestId: entry.requestId } : {}),
        ...(entry.traceId ? { traceId: entry.traceId } : {}),
        ...(entry.operationId ? { operationId: entry.operationId } : {}),
        ...(entry.causationId ? { causationId: entry.causationId } : {}),
        outcome: entry.outcome ?? 'success',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
    async query(filter) {
      const result = await repos.audit.listByFilter(filter);
      return {
        total: result.total,
        items: result.items.map((item) => ({
          actorId: item.actorId,
          action: item.action,
          entityId: item.entityId,
          ...(item.teamId ? { teamId: item.teamId } : {}),
          ...(item.payload ? { metadata: item.payload } : {}),
          eventVersion: item.eventVersion ?? 1,
          sourceService: item.sourceService ?? 'host-local',
          ...(item.requestId ? { requestId: item.requestId } : {}),
          ...(item.traceId ? { traceId: item.traceId } : {}),
          ...(item.operationId ? { operationId: item.operationId } : {}),
          ...(item.causationId ? { causationId: item.causationId } : {}),
          outcome: item.outcome ?? 'success',
          timestamp: item.createdAt,
        })),
      } as Awaited<ReturnType<AuditLogPort['query']>>;
    },
  };
}

export function createQueuePorts(asyncTransport?: HostLocalAsyncTransport): QueuePorts {
  if (asyncTransport) {
    return {
      task: {
        kind: asyncTransport.task.kind,
        enqueue: (type, payload, options) => asyncTransport.task.enqueue(type, payload, options),
        requeue: (taskId) => asyncTransport.task.requeue(taskId),
        getStatusSnapshot: () => asyncTransport.task.getStatusSnapshot(),
        async createConsumer(params) {
          if (!asyncTransport.task.createConsumer) {
            throw new Error('Task transport does not support consumers');
          }
          return asyncTransport.task.createConsumer({
            ownsWork: params.ownsWork,
            handlers: params.handlers.map((handler) => ({
              type: handler.type,
              handle: (
                task: { id: string; type: string; payload: unknown; attempts: number },
                signal: AbortSignal,
              ) =>
                handler.handle(
                  {
                    id: task.id,
                    type: task.type,
                    payload: task.payload,
                    attempt: task.attempts,
                  },
                  signal,
                ),
              ...(handler.onDead
                ? {
                    onDead: (task: { id: string; type: string; payload: unknown }) =>
                      handler.onDead?.(task),
                  }
                : {}),
            })) as unknown as Parameters<
              NonNullable<HostLocalAsyncTransport['task']['createConsumer']>
            >[0]['handlers'],
          });
        },
      },
      outbox: asyncTransport.events,
    };
  }

  const missingTransportError = () =>
    new Error('Host-local async transport is not configured; queue ports cannot be used');

  return {
    task: {
      kind: 'postgres-task-queue',
      async enqueue() {
        throw missingTransportError();
      },
      async requeue() {
        throw missingTransportError();
      },
      async getStatusSnapshot() {
        return {
          provider: 'postgres',
          pending: 0,
          running: 0,
          dead: 0,
          staleRunning: 0,
          reclaimCount: 0,
        };
      },
    },
    outbox: {
      kind: 'postgres-domain-outbox',
      async enqueue() {
        throw missingTransportError();
      },
      async claimBatch() {
        throw missingTransportError();
      },
      async complete() {
        throw missingTransportError();
      },
      async fail() {
        throw missingTransportError();
      },
      async getStatusSnapshot() {
        return {
          provider: 'postgres',
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          reclaimCount: 0,
        };
      },
    },
  };
}
