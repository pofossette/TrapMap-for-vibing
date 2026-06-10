import type { Permission } from '@trapmap/contracts';
import type { FastifyRequest } from 'fastify';

import type { ServerConfig } from '@trapmap/server/config.js';
import type { AiProviders } from './ai/types.js';
import type { UsageAnalyticsRepository } from './analytics/index.js';
import type { ArtifactRepository } from './artifacts/index.js';
import type { AccessKeyRepository } from './auth/index.js';
import type { SessionRepository } from './auth/index.js';
import type { GraphQueryBackend, GraphQueryRuntimeState } from './graph-query/backend.js';
import type { AdapterRegistry } from './indexing/registry.js';
import type { KnowledgeRepository } from './knowledge/index.js';
import type { LifecycleEventBus } from './lifecycle/event-bus.js';
import type { SkillShareerRepos } from './repos/index.js';
import type { ChannelRegistry } from './retrieval/orchestration/channel-registry.js';
import type { StrategyRegistry } from './retrieval/orchestration/strategy-registry.js';
import type { RequestContext } from './runtime/request-context.js';
import type { MembershipRecord, SkillShareerStore, TeamRecord, UserRecord } from './store.js';
import type { MembershipRepository, TeamRepository } from './teams/index.js';
import type { UserRepository } from './users/index.js';

export interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  /** Adapter registry for indexing pipeline (replaces indexAdapters array) */
  adapterRegistry: AdapterRegistry;
  /** Channel registry for retrieval recall channels */
  channelRegistry: ChannelRegistry;
  /** Strategy registry for retrieval strategy dispatch */
  strategyRegistry: StrategyRegistry;
  ai: AiProviders;
  /**
   * @deprecated Use `repos.knowledge` instead. Retained for backward compatibility only.
   */
  knowledgeRepo: KnowledgeRepository | undefined;
  /**
   * @deprecated Use `repos.artifact` instead. Retained for backward compatibility only.
   */
  artifactRepo: ArtifactRepository | undefined;
  /**
   * @deprecated Use `repos.session` instead. Retained for backward compatibility only.
   */
  sessionRepo: SessionRepository | undefined;
  /**
   * @deprecated Use `repos.accessKey` instead. Retained for backward compatibility only.
   */
  accessKeyRepo: AccessKeyRepository | undefined;
  /**
   * @deprecated Use `repos.user` instead. Retained for backward compatibility only.
   */
  userRepo: UserRepository | undefined;
  /**
   * @deprecated Use `repos.team` instead. Retained for backward compatibility only.
   */
  teamRepo: TeamRepository | undefined;
  /**
   * @deprecated Use `repos.membership` instead. Retained for backward compatibility only.
   */
  membershipRepo: MembershipRepository | undefined;
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
}

export interface ResolvedAuthContext {
  subjectType: 'user' | 'system-admin';
  actorId: string;
  handle: string;
  activeTeamId: string | null;
  securityLevel: number;
  effectivePermissions: Permission[];
  user: UserRecord | null;
  membership: MembershipRecord | null;
  team: TeamRecord | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    skillShareer: SkillShareerServices;
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
