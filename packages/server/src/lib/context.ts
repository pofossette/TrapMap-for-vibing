import type {
  ArtifactReadProjection,
  ConflictRelation,
  DecayState,
  GraphIndexRepositoryPort,
  KnowledgeOwnerPort,
  Permission,
  RetrievalGovernanceProjection,
} from '@trapmap/contracts';
import type {
  // fallow-ignore-next-line boundary-violation -- server compatibility bundle consumes host-owned identity port types
  AccessKeyRepositoryPort,
  ActorBatchLookupPort,
  AuditLogPort,
  JobRuntimePort,
  MembershipRepositoryPort,
  PermissionCheckPort,
  SessionLookupPort,
  SessionRepositoryPort,
  TeamLookupPort,
  TeamRepositoryPort,
  UserRepositoryPort,
} from '@trapmap/backend-core';
import type { FastifyRequest } from 'fastify';
import type { AiProviders } from '@trapmap/ai-providers';

import type { ServerConfig } from '@trapmap/server/config.js';
import type { UsageAnalyticsRepository } from './analytics/index.js';
import type { AsyncTransport } from './async/transport.js';
import type { GraphQueryBackend, GraphQueryRuntimeState } from '@trapmap/service-knowledge-read';
import type { AdapterRegistry } from './indexing/registry.js';
import type { LifecycleEventBus } from './lifecycle/index.js';
import type { SkillShareerRepos } from './repos/index.js';
import type { ChannelRegistry, StrategyRegistry } from './retrieval/orchestration/index.js';
import type {
  RequestContext,
  ResolvedRuntimeDeployment,
  RuntimeMode,
  RuntimeWorkerHandle,
  ServiceUnit,
  TracingPort,
} from './runtime/index.js';
import type { MembershipRecord, SkillShareerStore, TeamRecord, UserRecord } from './store.js';

/** Structural compatibility bridge injected by a host that owns identity. */
export interface IdentityCompatibilityBundle {
  sessionRepo: SessionRepositoryPort;
  accessKeyRepo: AccessKeyRepositoryPort;
  teamRepo: TeamRepositoryPort;
  membershipRepo: MembershipRepositoryPort;
  userRepo: UserRepositoryPort;
  sessionLookup: SessionLookupPort;
  teamLookup: TeamLookupPort;
  permissionCheck: PermissionCheckPort;
  auditLog: AuditLogPort;
  actorLookup: ActorBatchLookupPort;
}

export interface OutboxWorkerFactory {
  create(params: {
    outbox: NonNullable<SkillShareerServices['asyncTransport']>['events'];
    handlers: Array<{ eventName: string; handle(payload: unknown): Promise<void> }>;
    ownsWork: boolean;
    onError(error: unknown, event?: { eventName: string; aggregateId: string }): void;
  }): RuntimeWorkerHandle;
}

/**
 * Structural read-side projection injected by the knowledge-read owner.
 * Compatibility routes use it only while the gateway package is being retired.
 */
export interface OwnerReadModelProjection {
  getReadModel(): Promise<{
    knowledgeEntries: Array<{
      id: string;
      teamId: string | null;
      scope: string;
      labels: string[];
      shortcut: string;
      detail: string;
      requiredLevel: number;
      lifecycleState: string;
      updatedAt: string;
      boundary: unknown | null;
      indexState: unknown | null;
      decayMeta: {
        lastVerifiedAt: string;
        decayState: DecayState;
        supersededById: string | null;
        freshnessType?: string;
      } | null;
      maintenanceMeta: {
        maintainerUserId: string | null;
        maintainerHandle: string | null;
        maintainerLevel: number | null;
        reviewBy: string | null;
      } | null;
    }>;
  }>;
}

export interface SkillShareerServices {
  config: ServerConfig;
  runtimeDeployment: ResolvedRuntimeDeployment;
  runtimeMode: RuntimeMode;
  serviceUnit: ServiceUnit;
  store: SkillShareerStore;
  asyncTransport?: AsyncTransport;
  /** Adapter registry for indexing pipeline (replaces indexAdapters array) */
  adapterRegistry: AdapterRegistry;
  /** Channel registry for retrieval recall channels */
  channelRegistry: ChannelRegistry;
  /** Strategy registry for retrieval strategy dispatch */
  strategyRegistry: StrategyRegistry;
  ai: AiProviders;
  /** Wave-7 temporary PG-only artifact read projection. */
  artifactReadProjection: ArtifactReadProjection;
  /** Wave-2 owner-injected command and operational projection compatibility port. */
  knowledgeOwner: KnowledgeOwnerPort;
  /** Owner-built administrative read projection; never falls back to compatibility state. */
  ownerReadModel?: OwnerReadModelProjection;
  /** Derived graph projection injected by the knowledge-read owner. */
  graphIndex: GraphIndexRepositoryPort;
  governanceRetrievalProjection?: RetrievalGovernanceProjection<
    import('./store.js').FeedbackQueueRecord,
    ConflictRelation
  >;
  /** Identity/audit capabilities injected by the owning host. */
  identity: IdentityCompatibilityBundle;
  /**
   * @deprecated Use `repos.usageAnalytics` instead. Retained for backward compatibility only.
   */
  usageAnalyticsRepo: UsageAnalyticsRepository | undefined;
  /** Unified repository object — always populated in both JSON and PG modes. Prefer this over legacy flat repo properties. */
  repos: SkillShareerRepos;
  /** Query-time graph backend used by retrieval hot paths. */
  graphQueryBackend: GraphQueryBackend;
  /** Graph query backend state. Phase 1 exposes mode/config wiring before provider selection is implemented. */
  graphQuery: GraphQueryRuntimeState;
  /** Lifecycle event bus for domain event emission and subscription */
  eventBus: LifecycleEventBus;
  /** Job-runtime port injected by the owning host for async commands. */
  jobRuntime?: Pick<JobRuntimePort, 'schedule'>;
  /** Job-runtime worker factory injected by host composition. */
  outboxWorkerFactory?: OutboxWorkerFactory;
  /** TracingPort adapter for distributed tracing (Phase 2B). */
  tracing?: TracingPort;
}

export interface ResolvedAuthContext {
  subjectType: 'user' | 'system-admin';
  actorId: string;
  handle: string;
  activeTeamId: string | null;
  securityLevel: number;
  effectivePermissions: Permission[];
  localSingleUserMode?: boolean;
  user: UserRecord | null;
  membership: MembershipRecord | null;
  team: TeamRecord | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    skillShareer: SkillShareerServices;
    taskWorker?: RuntimeWorkerHandle;
    outboxWorker?: RuntimeWorkerHandle;
  }

  interface FastifyRequest {
    authContext?: ResolvedAuthContext;
    requestContext?: RequestContext;
  }
}

export function getSessionToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const headerToken = request.headers['x-session-token'];
  return typeof headerToken === 'string' ? headerToken.trim() : null;
}
