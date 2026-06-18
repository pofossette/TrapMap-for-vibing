/**
 * Testing utilities for backend-core.
 *
 * Provides stub implementations of ports for use in tests.
 * These stubs are intentionally minimal -- they satisfy the interface
 * contracts without performing real I/O.
 */

import type {
  PermissionCheckPort,
  SessionLookupPort,
  TeamLookupPort,
} from '../ports/actor-ports.js';
import type { AuditLogPort } from '../ports/audit-ports.js';
import type { MetricsPort } from '../ports/audit-ports.js';
import type {
  OutboxPort,
  OutboxStatusSnapshot,
  TaskQueuePort,
  TaskStatusSnapshot,
} from '../ports/queue-ports.js';
import type {
  AccessKeyRepositoryPort,
  AuditRepositoryPort,
  CandidateRepositoryPort,
  FeedbackRepositoryPort,
  KnowledgeRepositoryPort,
  MembershipRepositoryPort,
  SessionRepositoryPort,
  TeamRepositoryPort,
  UserRepositoryPort,
} from '../ports/repo-ports.js';
import type { RepositoryPorts } from '../ports/repo-ports.js';

// ---------------------------------------------------------------------------
// Stub: AuditLogPort
// ---------------------------------------------------------------------------

export function createStubAuditLog(): AuditLogPort {
  const entries: Array<{ action: string; actorId: string; entityId?: string; timestamp: string }> =
    [];
  return {
    async record(entry) {
      entries.push({ ...entry, timestamp: entry.timestamp ?? new Date().toISOString() });
    },
    async query(_filter) {
      return { items: entries, total: entries.length };
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: MetricsPort
// ---------------------------------------------------------------------------

export function createStubMetrics(): MetricsPort & {
  getCounters(): Map<string, number>;
  getDurations(): Array<{ name: string; durationMs: number }>;
  getGauges(): Map<string, number>;
} {
  const counters = new Map<string, number>();
  const durations: Array<{ name: string; durationMs: number }> = [];
  const gauges = new Map<string, number>();
  return {
    incrementCounter(name, _labels) {
      counters.set(name, (counters.get(name) ?? 0) + 1);
    },
    recordDuration(name, durationMs, _labels) {
      durations.push({ name, durationMs });
    },
    recordGauge(name, value, _labels) {
      gauges.set(name, value);
    },
    getCounters() {
      return counters;
    },
    getDurations() {
      return durations;
    },
    getGauges() {
      return gauges;
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: SessionLookupPort
// ---------------------------------------------------------------------------

export function createStubSessionLookup(): SessionLookupPort {
  return {
    async resolveSession(_sessionToken) {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: TeamLookupPort
// ---------------------------------------------------------------------------

export function createStubTeamLookup(): TeamLookupPort {
  return {
    async getTeam(_teamId) {
      return null;
    },
    async listTeamsForUser(_userId) {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: PermissionCheckPort
// ---------------------------------------------------------------------------

export function createStubPermissionCheck(): PermissionCheckPort {
  return {
    async resolvePermissions(_userId, _teamId) {
      return [];
    },
    async hasPermission(_userId, _teamId, _permission) {
      return false;
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: TaskQueuePort
// ---------------------------------------------------------------------------

export function createStubTaskQueue(): TaskQueuePort {
  return {
    kind: 'postgres-task-queue',
    async enqueue(_type, _payload, _options) {
      return `task_${Date.now()}`;
    },
    async requeue(_taskId) {
      /* no-op */
    },
    async getStatusSnapshot(): Promise<TaskStatusSnapshot> {
      return {
        provider: 'postgres',
        pending: 0,
        running: 0,
        dead: 0,
        staleRunning: 0,
        reclaimCount: 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: OutboxPort
// ---------------------------------------------------------------------------

export function createStubOutbox(): OutboxPort {
  return {
    kind: 'postgres-domain-outbox',
    async enqueue(_params) {
      return `event_${Date.now()}`;
    },
    async claimBatch(_limit, _workerId) {
      return [];
    },
    async complete(_eventId) {
      /* no-op */
    },
    async fail(_eventId, _error) {
      /* no-op */
    },
    async getStatusSnapshot(): Promise<OutboxStatusSnapshot> {
      return {
        provider: 'postgres',
        pending: 0,
        processing: 0,
        failed: 0,
        staleProcessing: 0,
        reclaimCount: 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: KnowledgeRepositoryPort
// ---------------------------------------------------------------------------

export function createStubKnowledgeRepository(): KnowledgeRepositoryPort {
  return {
    async nextId() {
      return `k_${Date.now()}`;
    },
    async insert(_entry) {
      /* no-op */
    },
    async getById(_entryId) {
      return null;
    },
    async updateLifecycle(_entryId, _newState, _context) {
      return {} as never;
    },
    async appendRevision(_entryId, _revision) {
      /* no-op */
    },
    async appendLifecycleEvent(_entryId, _event) {
      /* no-op */
    },
    async listByFilter(_filter) {
      return [];
    },
    async updateGovernance(_entryId, _governance) {
      /* no-op */
    },
    async updateEmbeddingCache(_entryId, _cache) {
      /* no-op */
    },
    async supersede(_entryId, _input) {
      return {} as never;
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: CandidateRepositoryPort
// ---------------------------------------------------------------------------

export function createStubCandidateRepository(): CandidateRepositoryPort {
  return {
    async insert(_candidate) {
      /* no-op */
    },
    async getById(_candidateId) {
      return null;
    },
    async updateStatus(_candidateId, _status, _error) {
      /* no-op */
    },
    async attachAnalysis(_candidateId, _snapshot) {
      /* no-op */
    },
    async attachDuplicateCase(_candidateId, _duplicateCase) {
      /* no-op */
    },
    async attachManualResult(_candidateId, _result, _reviewedBy) {
      /* no-op */
    },
    async listByStatus(_status) {
      return [];
    },
    async markResolved(_candidateId, _resolvedBy) {
      /* no-op */
    },
    async findByFingerprint(_fingerprint) {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: SessionRepositoryPort
// ---------------------------------------------------------------------------

export function createStubSessionRepository(): SessionRepositoryPort {
  return {
    async nextId() {
      return `s_${Date.now()}`;
    },
    async create(session) {
      return { id: 's1', ...session, createdAt: '', updatedAt: '' } as never;
    },
    async getByTokenHash(_tokenHash) {
      return null;
    },
    async deleteByTokenHash(_tokenHash) {
      /* no-op */
    },
    async updateActiveTeam(_sessionId, _teamId) {
      return {} as never;
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: AccessKeyRepositoryPort
// ---------------------------------------------------------------------------

export function createStubAccessKeyRepository(): AccessKeyRepositoryPort {
  return {
    async nextId() {
      return `ak_${Date.now()}`;
    },
    async insert(_key) {
      /* no-op */
    },
    async getByTokenHash(_tokenHash) {
      return null;
    },
    async getById(_keyId) {
      return null;
    },
    async revoke(_keyId) {
      /* no-op */
    },
    async listByMember(_memberId) {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: TeamRepositoryPort
// ---------------------------------------------------------------------------

export function createStubTeamRepository(): TeamRepositoryPort {
  return {
    async nextId() {
      return `t_${Date.now()}`;
    },
    async insert(_team) {
      /* no-op */
    },
    async getById(_teamId) {
      return null;
    },
    async getBySlug(_slug) {
      return null;
    },
    async listAll() {
      return [];
    },
    async update(_teamId, _updates) {
      /* no-op */
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: MembershipRepositoryPort
// ---------------------------------------------------------------------------

export function createStubMembershipRepository(): MembershipRepositoryPort {
  return {
    async nextId() {
      return `m_${Date.now()}`;
    },
    async insert(_membership) {
      /* no-op */
    },
    async getById(_membershipId) {
      return null;
    },
    async findByUserAndTeam(_userId, _teamId) {
      return null;
    },
    async listByUser(_userId) {
      return [];
    },
    async listByTeam(_teamId) {
      return [];
    },
    async update(_membershipId, _updates) {
      /* no-op */
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: UserRepositoryPort
// ---------------------------------------------------------------------------

export function createStubUserRepository(): UserRepositoryPort {
  return {
    async nextId() {
      return `u_${Date.now()}`;
    },
    async insert(_user) {
      /* no-op */
    },
    async getById(_userId) {
      return null;
    },
    async getByHandle(_handle) {
      return null;
    },
    async update(_userId, _updates) {
      /* no-op */
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: FeedbackRepositoryPort
// ---------------------------------------------------------------------------

export function createStubFeedbackRepository(): FeedbackRepositoryPort {
  return {
    async nextId() {
      return `f_${Date.now()}`;
    },
    async insert(_feedback) {
      /* no-op */
    },
    async getById(_feedbackId) {
      return null;
    },
    async listByEntry(_entryId) {
      return [];
    },
    async listByStatus(_status) {
      return [];
    },
    async listByFilter(_filter) {
      return [];
    },
    async update(_feedbackId, _updates) {
      /* no-op */
    },
  };
}

// ---------------------------------------------------------------------------
// Stub: AuditRepositoryPort
// ---------------------------------------------------------------------------

export function createStubAuditRepository(): AuditRepositoryPort {
  return {
    async nextId() {
      return `ae_${Date.now()}`;
    },
    async insert(_event) {
      /* no-op */
    },
    async getById(_eventId) {
      return null;
    },
    async listByFilter(_filter) {
      return { items: [], total: 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: create a full stub RepositoryPorts bundle
// ---------------------------------------------------------------------------

export function createStubRepositoryPorts(): RepositoryPorts {
  return {
    knowledge: createStubKnowledgeRepository(),
    candidate: createStubCandidateRepository(),
    session: createStubSessionRepository(),
    accessKey: createStubAccessKeyRepository(),
    team: createStubTeamRepository(),
    membership: createStubMembershipRepository(),
    user: createStubUserRepository(),
    feedback: createStubFeedbackRepository(),
    audit: createStubAuditRepository(),
  };
}
