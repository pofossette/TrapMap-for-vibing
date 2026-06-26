/**
 * Stub port factories.
 *
 * Minimal no-op implementations for ports that are not provided by the caller.
 * These allow the light host to boot with sensible defaults even when no
 * external persistence or infrastructure is wired in.
 *
 * @stub These implementations return empty/fake data and are intended only
 * for development scaffolding. Production deployments should provide real
 * port implementations via BootstrapOptions.
 */

import type {
  AuditLogPort,
  OutboxPort,
  PermissionCheckPort,
  QueuePorts,
  RepositoryPorts,
  RetrievalQueryPort,
  SessionLookupPort,
  TaskQueuePort,
  TeamLookupPort,
} from '@trapmap/backend-core';

const emittedStubWarnings = new Set<string>();

function warnStubUsage(name: string, message: string): void {
  const key = `${name}:${message}`;
  if (emittedStubWarnings.has(key)) {
    return;
  }
  emittedStubWarnings.add(key);
  console.warn(`[host-local stub] ${name}: ${message}`);
}

// ---------------------------------------------------------------------------
// Service-port stubs
// ---------------------------------------------------------------------------

export function createStubSessionLookup(): SessionLookupPort {
  warnStubUsage(
    'sessionLookup',
    'using development stub; authenticated runtime lookups are absent',
  );
  return {
    async resolveSession() {
      return null;
    },
  };
}

export function createStubTeamLookup(): TeamLookupPort {
  warnStubUsage('teamLookup', 'using development stub; team resolution will always return empty');
  return {
    async getTeam() {
      return null;
    },
    async listTeamsForUser() {
      return [];
    },
  };
}

export function createStubPermissionCheck(): PermissionCheckPort {
  warnStubUsage(
    'permissionCheck',
    'using development stub; permission evaluation always denies access',
  );
  return {
    async resolvePermissions() {
      return [];
    },
    async hasPermission() {
      return false;
    },
  };
}

export function createStubAuditLog(): AuditLogPort {
  warnStubUsage('auditLog', 'using development stub; audit writes are discarded');
  return {
    async record() {
      /* no-op */
    },
    async query() {
      return { items: [], total: 0 };
    },
  };
}

export function createStubRetrievalQuery(): RetrievalQueryPort {
  warnStubUsage('retrievalQuery', 'using development stub; retrieval always returns empty results');
  return {
    async search() {
      return { results: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// Repository stubs
// ---------------------------------------------------------------------------

export function createStubKnowledgeRepo(): RepositoryPorts['knowledge'] {
  warnStubUsage('knowledgeRepo', 'using development stub; knowledge writes are non-durable');
  return {
    async nextId() {
      return `k_${Date.now()}`;
    },
    async insert() {
      /* no-op */
    },
    async getById() {
      return null;
    },
    async updateLifecycle() {
      return {} as never;
    },
    async appendRevision() {
      /* no-op */
    },
    async appendLifecycleEvent() {
      /* no-op */
    },
    async listByFilter() {
      return [];
    },
    async updateGovernance() {
      /* no-op */
    },
    async updateEmbeddingCache() {
      /* no-op */
    },
    async supersede() {
      return {} as never;
    },
  };
}

export function createStubCandidateRepo(): RepositoryPorts['candidate'] {
  warnStubUsage('candidateRepo', 'using development stub; candidate workflow state is non-durable');
  return {
    async insert() {
      /* no-op */
    },
    async getById() {
      return null;
    },
    async updateStatus() {
      /* no-op */
    },
    async attachAnalysis() {
      /* no-op */
    },
    async attachDuplicateCase() {
      /* no-op */
    },
    async attachManualResult() {
      /* no-op */
    },
    async listByStatus() {
      return [];
    },
    async markResolved() {
      /* no-op */
    },
    async findByFingerprint() {
      return null;
    },
  };
}

export function createStubSessionRepo(): RepositoryPorts['session'] {
  warnStubUsage('sessionRepo', 'using development stub; sessions are not persisted');
  return {
    async nextId() {
      return `s_${Date.now()}`;
    },
    async create() {
      return {} as never;
    },
    async getByTokenHash() {
      return null;
    },
    async deleteByTokenHash() {
      /* no-op */
    },
    async updateActiveTeam() {
      return {} as never;
    },
  };
}

export function createStubAccessKeyRepo(): RepositoryPorts['accessKey'] {
  warnStubUsage('accessKeyRepo', 'using development stub; access keys are not persisted');
  return {
    async nextId() {
      return `ak_${Date.now()}`;
    },
    async insert() {
      /* no-op */
    },
    async getByTokenHash() {
      return null;
    },
    async getById() {
      return null;
    },
    async revoke() {
      /* no-op */
    },
    async listByMember() {
      return [];
    },
  };
}

export function createStubTeamRepo(): RepositoryPorts['team'] {
  warnStubUsage('teamRepo', 'using development stub; team state is not persisted');
  return {
    async nextId() {
      return `t_${Date.now()}`;
    },
    async insert() {
      /* no-op */
    },
    async getById() {
      return null;
    },
    async getBySlug() {
      return null;
    },
    async listAll() {
      return [];
    },
    async update() {
      /* no-op */
    },
  };
}

export function createStubMembershipRepo(): RepositoryPorts['membership'] {
  warnStubUsage('membershipRepo', 'using development stub; membership state is not persisted');
  return {
    async nextId() {
      return `m_${Date.now()}`;
    },
    async insert() {
      /* no-op */
    },
    async getById() {
      return null;
    },
    async findByUserAndTeam() {
      return null;
    },
    async listByUser() {
      return [];
    },
    async listByTeam() {
      return [];
    },
    async update() {
      /* no-op */
    },
  };
}

export function createStubUserRepo(): RepositoryPorts['user'] {
  warnStubUsage('userRepo', 'using development stub; user state is not persisted');
  return {
    async nextId() {
      return `u_${Date.now()}`;
    },
    async insert() {
      /* no-op */
    },
    async getById() {
      return null;
    },
    async getByHandle() {
      return null;
    },
    async update() {
      /* no-op */
    },
  };
}

export function createStubFeedbackRepo(): RepositoryPorts['feedback'] {
  warnStubUsage('feedbackRepo', 'using development stub; feedback state is not persisted');
  return {
    async nextId() {
      return `f_${Date.now()}`;
    },
    async insert() {
      /* no-op */
    },
    async getById() {
      return null;
    },
    async listByEntry() {
      return [];
    },
    async listByStatus() {
      return [];
    },
    async listByFilter() {
      return [];
    },
    async update() {
      /* no-op */
    },
  };
}

// ---------------------------------------------------------------------------
// Queue port stubs
// ---------------------------------------------------------------------------

export function createStubTaskQueue(): TaskQueuePort {
  warnStubUsage('taskQueue', 'using development stub; enqueued tasks will never be consumed');
  return {
    kind: 'postgres-task-queue',
    async enqueue() {
      return `task_${Date.now()}`;
    },
    async requeue() {
      /* no-op */
    },
    async getStatusSnapshot() {
      return {
        provider: 'postgres' as const,
        pending: 0,
        running: 0,
        dead: 0,
        staleRunning: 0,
        reclaimCount: 0,
      };
    },
  };
}

export function createStubOutbox(): OutboxPort {
  warnStubUsage('outbox', 'using development stub; outbox events will never be dispatched');
  return {
    kind: 'postgres-domain-outbox',
    async enqueue() {
      return `event_${Date.now()}`;
    },
    async claimBatch() {
      return [];
    },
    async complete() {
      /* no-op */
    },
    async fail() {
      /* no-op */
    },
    async getStatusSnapshot() {
      return {
        provider: 'postgres' as const,
        pending: 0,
        processing: 0,
        failed: 0,
        staleProcessing: 0,
        reclaimCount: 0,
      };
    },
  };
}

export function createQueuePorts(
  taskQueue?: TaskQueuePort | null,
  outbox?: OutboxPort | null,
): QueuePorts {
  return {
    task: taskQueue ?? createStubTaskQueue(),
    outbox: outbox ?? createStubOutbox(),
  };
}
