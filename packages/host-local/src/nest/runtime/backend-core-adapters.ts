import type {
  AuditLogPort,
  FeedbackRepositoryPort,
  KnowledgeRepositoryPort,
  MembershipRepositoryPort,
  QueuePorts,
  SessionRepositoryPort,
  TeamRepositoryPort,
  UserRepositoryPort,
  AccessKeyRepositoryPort,
} from '@trapmap/backend-core';
import type { RoleTemplate } from '@trapmap/contracts';

import { nowIso } from './now-iso.js';
import type { HostLocalAsyncTransport, HostLocalRepos } from './shared-infra.js';

function normalizeRoleTemplate(role: unknown): RoleTemplate {
  if (role === 'admin' || role === 'system-admin') {
    return role;
  }
  return 'user';
}

function normalizeKnowledgeEntry(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    content: String(record.detail ?? ''),
    title: String(record.shortcut ?? record.id),
    entryType: record.scope === 'global' ? 'trap' : 'skill',
    lifecycleState: record.lifecycleState,
    ownerUserId: String(record.ownerUserId),
    teamId: typeof record.teamId === 'string' ? record.teamId : '',
    labels: Array.isArray(record.labels) ? record.labels : [],
    requiredLevel: typeof record.requiredLevel === 'number' ? record.requiredLevel : 0,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
  };
}

function createKnowledgeRecord(entry: Record<string, unknown>) {
  const timestamp = typeof entry.createdAt === 'string' ? entry.createdAt : nowIso();
  const content = String(entry.content ?? '');
  const title =
    typeof entry.title === 'string' && entry.title.trim().length > 0
      ? entry.title
      : content.slice(0, 80) || String(entry.id);
  const labels = Array.isArray(entry.labels) ? entry.labels : [];

  return {
    id: String(entry.id),
    teamId: typeof entry.teamId === 'string' && entry.teamId.length > 0 ? entry.teamId : null,
    scope: entry.entryType === 'trap' ? 'global' : 'project',
    labels,
    shortcut: title,
    detail: content,
    requiredLevel: typeof entry.requiredLevel === 'number' ? entry.requiredLevel : 0,
    lifecycleState: entry.lifecycleState,
    ownerUserId: String(entry.ownerUserId),
    latestRevision: {
      revision: 1,
      submittedAt: timestamp,
      submittedByUserId: String(entry.ownerUserId),
      shortcut: title,
      detail: content,
      labels,
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: entry.entryType === 'trap' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: timestamp,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
    createdAt: timestamp,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : timestamp,
  };
}

export function createKnowledgeRepoPort(
  knowledgeRepo: HostLocalRepos['knowledge'],
): KnowledgeRepositoryPort {
  return {
    nextId: () => knowledgeRepo.nextId(),
    async insert(entry) {
      await knowledgeRepo.insert(
        createKnowledgeRecord(entry as Record<string, unknown>) as Parameters<
          HostLocalRepos['knowledge']['insert']
        >[0],
      );
    },
    async getById(entryId) {
      const entry = await knowledgeRepo.getById(entryId);
      return entry
        ? (normalizeKnowledgeEntry(entry as unknown as Record<string, unknown>) as Awaited<
            ReturnType<KnowledgeRepositoryPort['getById']>
          >)
        : null;
    },
    async getByIds(entryIds) {
      const entries = (await knowledgeRepo.getByIds?.(entryIds)) ?? [];
      return entries.map((entry) =>
        normalizeKnowledgeEntry(entry as unknown as Record<string, unknown>),
      ) as Awaited<ReturnType<NonNullable<KnowledgeRepositoryPort['getByIds']>>>;
    },
    async updateLifecycle(entryId, newState, context) {
      const updated = await knowledgeRepo.updateLifecycle(entryId, newState, context);
      return normalizeKnowledgeEntry(
        updated as unknown as Record<string, unknown>,
      ) as Awaited<ReturnType<KnowledgeRepositoryPort['updateLifecycle']>>;
    },
    async appendRevision(entryId, revision) {
      await knowledgeRepo.appendRevision(entryId, revision as unknown as never);
    },
    async appendLifecycleEvent(entryId, event) {
      await knowledgeRepo.appendLifecycleEvent(entryId, event as unknown as never);
    },
    async listByFilter(filter) {
      const entries = await knowledgeRepo.listByFilter(filter);
      return entries.map((entry) =>
        normalizeKnowledgeEntry(entry as unknown as Record<string, unknown>),
      ) as Awaited<ReturnType<KnowledgeRepositoryPort['listByFilter']>>;
    },
    updateGovernance: (entryId, governance) => knowledgeRepo.updateGovernance(entryId, governance),
    async updateEmbeddingCache(entryId, cache) {
      await knowledgeRepo.updateEmbeddingCache(entryId, cache as unknown as never);
    },
    async supersede(entryId, input) {
      const updated = await knowledgeRepo.supersede(entryId, input);
      return normalizeKnowledgeEntry(
        updated as unknown as Record<string, unknown>,
      ) as Awaited<ReturnType<KnowledgeRepositoryPort['supersede']>>;
    },
    async save(entry) {
      if (!knowledgeRepo.save) {
        throw new Error('Knowledge repository does not support save');
      }
      await knowledgeRepo.save(
        createKnowledgeRecord(entry as Record<string, unknown>) as Parameters<
          NonNullable<HostLocalRepos['knowledge']['save']>
        >[0],
      );
    },
  };
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

export function createIdentityAccessRepos(repos: Pick<
  HostLocalRepos,
  'session' | 'accessKey' | 'team' | 'membership' | 'user'
>): {
  sessionRepo: SessionRepositoryPort;
  accessKeyRepo: AccessKeyRepositoryPort;
  teamRepo: TeamRepositoryPort;
  membershipRepo: MembershipRepositoryPort;
  userRepo: UserRepositoryPort;
} {
  return {
    sessionRepo: {
      nextId: () => repos.session.nextId(),
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
        const session = await repos.session.updateActiveTeam(sessionId, teamId);
        return normalizeSessionRecord(session as unknown as Record<string, unknown>) as Awaited<
          ReturnType<SessionRepositoryPort['updateActiveTeam']>
        >;
      },
    },
    accessKeyRepo: {
      nextId: () => repos.accessKey.nextId(),
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
      nextId: () => repos.team.nextId(),
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
      nextId: () => repos.membership.nextId(),
      async insert(membership) {
        const shape = membership as Record<string, unknown>;
        await repos.membership.insert({
          id: membership.id,
          userId: membership.userId,
          teamId: membership.teamId,
          roleTemplate: normalizeRoleTemplate(shape.role ?? membership.roleTemplate),
          securityLevel: typeof membership.securityLevel === 'number' ? membership.securityLevel : 0,
          permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
          notes: typeof membership.notes === 'string' ? membership.notes : null,
          createdAt: nowIso(),
          updatedAt: typeof membership.updatedAt === 'string' ? membership.updatedAt : nowIso(),
        } as Parameters<HostLocalRepos['membership']['insert']>[0]);
      },
      async getById(membershipId) {
        const membership = await repos.membership.getById(membershipId);
        return membership
          ? (normalizeMembershipRecord(
              membership as unknown as Record<string, unknown>,
            ) as Awaited<ReturnType<MembershipRepositoryPort['getById']>>)
          : null;
      },
      async findByUserAndTeam(userId, teamId) {
        const membership = await repos.membership.findByUserAndTeam(userId, teamId);
        return membership
          ? (normalizeMembershipRecord(
              membership as unknown as Record<string, unknown>,
            ) as Awaited<ReturnType<MembershipRepositoryPort['findByUserAndTeam']>>)
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
      nextId: () => repos.user.nextId(),
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

function normalizeFeedbackRecord(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    entryId: String(record.entryId),
    entryType: record.entryType === 'trap' ? 'trap' : 'skill',
    problemType: record.problemType,
    description: String(record.description ?? ''),
    context: typeof record.context === 'string' ? record.context : null,
    querySeed: typeof record.querySeed === 'string' ? record.querySeed : null,
    queryId: typeof record.queryId === 'string' ? record.queryId : null,
    routeFamily:
      record.routeFamily === 'capsule' || record.routeFamily === 'graph-plan'
        ? record.routeFamily
        : record.routeFamily === 'entry'
          ? 'entry'
          : null,
    failureClassification:
      record.failureClassification === 'recall-miss' ||
      record.failureClassification === 'ranking-error' ||
      record.failureClassification === 'summary-hallucination' ||
      record.failureClassification === 'governance-leak' ||
      record.failureClassification === 'stale-content'
        ? record.failureClassification
        : null,
    expectedCorrection:
      typeof record.expectedCorrection === 'string' ? record.expectedCorrection : null,
    selectedResultSnapshot:
      record.selectedResultSnapshot && typeof record.selectedResultSnapshot === 'object'
        ? (record.selectedResultSnapshot as Record<string, unknown>)
        : null,
    customAnswers: Array.isArray(record.customAnswers)
      ? (record.customAnswers as Array<{ prompt: string; answer: string }>)
      : null,
    submittedAt: String(record.submittedAt ?? nowIso()),
    submittedByUserId: String(record.submittedByUserId ?? 'system'),
    submittedByHandle: String(record.submittedByHandle ?? 'system'),
    status: record.status,
    adminNotes: typeof record.adminNotes === 'string' ? record.adminNotes : null,
    resolvedAt: typeof record.resolvedAt === 'string' ? record.resolvedAt : null,
    resolvedByUserId:
      typeof record.resolvedByUserId === 'string' ? record.resolvedByUserId : null,
    triggeredTransition:
      typeof record.triggeredTransition === 'string' ? record.triggeredTransition : null,
    remediationStatus:
      record.remediationStatus === 'pending-human-review' ||
      record.remediationStatus === 'in-remediation' ||
      record.remediationStatus === 'ready-to-reindex'
        ? record.remediationStatus
        : null,
    remediationOpenedAt:
      typeof record.remediationOpenedAt === 'string' ? record.remediationOpenedAt : null,
    remediationOpenedByUserId:
      typeof record.remediationOpenedByUserId === 'string'
        ? record.remediationOpenedByUserId
        : null,
    remediationResolvedAt:
      typeof record.remediationResolvedAt === 'string' ? record.remediationResolvedAt : null,
    remediationResolvedByUserId:
      typeof record.remediationResolvedByUserId === 'string'
        ? record.remediationResolvedByUserId
        : null,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: String(record.updatedAt ?? nowIso()),
  };
}

export function createFeedbackRepoPort(
  feedbackRepo: HostLocalRepos['feedback'],
): FeedbackRepositoryPort {
  return {
    nextId: () => feedbackRepo.nextId(),
    async insert(feedback) {
      const shape = feedback as Record<string, unknown>;
      await feedbackRepo.insert({
        id: feedback.id,
        entryId: feedback.entryId,
        entryType: feedback.entryType === 'trap' ? 'trap' : 'skill',
        problemType:
          feedback.problemType === 'incorrect' ||
          feedback.problemType === 'outdated' ||
          feedback.problemType === 'context-mismatch' ||
          feedback.problemType === 'incomplete' ||
          feedback.problemType === 'other'
            ? feedback.problemType
            : 'other',
        description: String(shape.description ?? ''),
        context: typeof shape.context === 'string' ? shape.context : null,
        querySeed: typeof shape.querySeed === 'string' ? shape.querySeed : null,
        queryId: typeof shape.queryId === 'string' ? shape.queryId : null,
        routeFamily: null,
        failureClassification: null,
        expectedCorrection: null,
        selectedResultSnapshot: null,
        customAnswers: null,
        submittedAt: typeof shape.submittedAt === 'string' ? shape.submittedAt : nowIso(),
        submittedByUserId:
          typeof shape.submittedByUserId === 'string'
            ? shape.submittedByUserId
            : typeof shape.submittedBy === 'string'
              ? shape.submittedBy
              : 'system',
        submittedByHandle: typeof shape.submittedByHandle === 'string' ? shape.submittedByHandle : 'system',
        status: feedback.status === 'open' ? 'new' : 'new',
        adminNotes: typeof shape.adminNotes === 'string' ? shape.adminNotes : null,
        resolvedAt: null,
        resolvedByUserId: null,
        triggeredTransition: null,
        remediationStatus: null,
        remediationOpenedAt: null,
        remediationOpenedByUserId: null,
        remediationResolvedAt: null,
        remediationResolvedByUserId: null,
        createdAt: typeof shape.createdAt === 'string' ? shape.createdAt : nowIso(),
        updatedAt: typeof shape.updatedAt === 'string' ? shape.updatedAt : nowIso(),
      } as Parameters<HostLocalRepos['feedback']['insert']>[0]);
    },
    async getById(feedbackId) {
      const feedback = await feedbackRepo.getById(feedbackId);
      return feedback
        ? (normalizeFeedbackRecord(feedback as unknown as Record<string, unknown>) as Awaited<
            ReturnType<FeedbackRepositoryPort['getById']>
          >)
        : null;
    },
    async listByEntry(entryId) {
      const feedback = await feedbackRepo.listByEntry(entryId);
      return feedback.map((item) =>
        normalizeFeedbackRecord(item as unknown as Record<string, unknown>),
      ) as Awaited<ReturnType<FeedbackRepositoryPort['listByEntry']>>;
    },
    async listByStatus(status) {
      const feedback = await feedbackRepo.listByStatus(status);
      return feedback.map((item) =>
        normalizeFeedbackRecord(item as unknown as Record<string, unknown>),
      ) as Awaited<ReturnType<FeedbackRepositoryPort['listByStatus']>>;
    },
    async listByFilter(filter) {
      const feedback = await feedbackRepo.listByFilter(filter);
      return feedback.map((item) =>
        normalizeFeedbackRecord(item as unknown as Record<string, unknown>),
      ) as Awaited<ReturnType<FeedbackRepositoryPort['listByFilter']>>;
    },
    update: (feedbackId, updates) => feedbackRepo.update(feedbackId, updates as never),
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
      };
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
              handle: (task: { id: string; type: string; payload: unknown; attempts: number }, signal: AbortSignal) =>
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
            })) as Parameters<NonNullable<HostLocalAsyncTransport['task']['createConsumer']>>[0]['handlers'],
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
