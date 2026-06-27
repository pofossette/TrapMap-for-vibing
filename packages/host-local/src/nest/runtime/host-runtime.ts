import { randomUUID } from 'node:crypto';

import type {
  AuditLogEntry,
  AuditLogPort,
  PermissionCheckPort,
  QueuePorts,
  ResolvedAuthContext,
  ResolvedSession,
  RetrievalQueryPort,
  SessionLookupPort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import type { Permission } from '@trapmap/contracts';
import { createAsyncTransport } from '@trapmap/server/lib/async/factory.js';
import { createAiProviders } from '@trapmap/server/lib/ai/index.js';
import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { setGlobalEmbeddingsProvider } from '@trapmap/server/lib/embeddings.js';
import { createMemoryGraphQueryBackend } from '@trapmap/server/lib/graph-query/memory-backend.js';
import { buildDefaultAdapterRegistry } from '@trapmap/server/lib/indexing/adapters/index.js';
import { LifecycleEventBus } from '@trapmap/server/lib/lifecycle/event-bus.js';
import { createSkillShareerStore } from '@trapmap/server/lib/persistence/create-store.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createAllRepos } from '@trapmap/server/lib/repos/index.js';
import { keywordChannel } from '@trapmap/server/lib/retrieval/recall/keyword.js';
import { semanticChannel } from '@trapmap/server/lib/retrieval/recall/semantic.js';
import { ChannelRegistry } from '@trapmap/server/lib/retrieval/orchestration/channel-registry.js';
import {
  graphAssistedRecall,
  hybridRecall,
  semanticRecall,
} from '@trapmap/server/lib/retrieval/orchestration/recall-coordinator.js';
import type { RetrievalStrategy } from '@trapmap/server/lib/retrieval/orchestration/strategy-registry.js';
import { StrategyRegistry } from '@trapmap/server/lib/retrieval/orchestration/strategy-registry.js';
import { searchKnowledge } from '@trapmap/server/lib/retrieval.js';
import { resolveEffectivePermissions } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { resolveRuntimeDeployment } from '@trapmap/server/lib/runtime/deployment-profile.js';
import { resolveServiceUnit } from '@trapmap/server/lib/runtime/service-unit.js';
import type { ServerConfig } from '@trapmap/server/config.js';

import { loadServerConfigBridge } from '../config/config-bridge.js';

export const HOST_LOCAL_RUNTIME_TOKEN = 'HOST_LOCAL_RUNTIME';

export interface HostLocalRuntime {
  services: SkillShareerServices;
  retrievalQuery: RetrievalQueryPort;
  sessionLookup: SessionLookupPort;
  teamLookup: TeamLookupPort;
  permissionCheck: PermissionCheckPort;
  auditLog: AuditLogPort;
  queuePorts: QueuePorts;
}

function createSessionLookup(services: SkillShareerServices): SessionLookupPort {
  return {
    async resolveSession(sessionToken: string): Promise<ResolvedSession | null> {
      try {
        const auth = await resolveAuthContext(services, {
          headers: { authorization: `Bearer ${sessionToken}` },
        } as never);
        return {
          sessionId: sessionToken,
          userId: auth.actorId,
          handle: auth.handle,
          activeTeamId: auth.activeTeamId,
          securityLevel: auth.securityLevel,
        };
      } catch {
        return null;
      }
    },
  };
}

function createTeamLookup(services: SkillShareerServices): TeamLookupPort {
  return {
    async getTeam(teamId: string) {
      const team = await services.repos.team.getById(teamId);
      return team ? { teamId: team.id, slug: team.slug, name: team.name } : null;
    },
    async listTeamsForUser(userId: string) {
      const memberships = await services.repos.membership.listByUser(userId);
      const teams = await Promise.all(
        memberships.map(async (membership) => services.repos.team.getById(membership.teamId)),
      );
      return teams
        .filter((team): team is NonNullable<typeof team> => team !== null)
        .map((team) => ({ teamId: team.id, slug: team.slug, name: team.name }));
    },
  };
}

function createPermissionCheck(services: SkillShareerServices): PermissionCheckPort {
  return {
    async resolvePermissions(userId: string, teamId: string | null): Promise<Permission[]> {
      if (!teamId) {
        return resolveEffectivePermissions('system-admin', []);
      }
      const membership = await services.repos.membership.findByUserAndTeam(userId, teamId);
      if (!membership) {
        return [];
      }
      return resolveEffectivePermissions(membership.roleTemplate, membership.permissions);
    },
    async hasPermission(userId: string, teamId: string | null, permission: Permission) {
      const permissions = await this.resolvePermissions(userId, teamId);
      return permissions.includes(permission);
    },
  };
}

function createAuditLog(services: SkillShareerServices): AuditLogPort {
  return {
    async record(entry: AuditLogEntry): Promise<void> {
      const id = await services.repos.audit.nextId();
      await services.repos.audit.insert({
        id,
        teamId: entry.teamId ?? null,
        actorId: entry.actorId,
        action: entry.action,
        entityId: entry.entityId ?? '',
        payload: entry.metadata ?? {},
        createdAt: entry.timestamp ?? nowIso(),
        updatedAt: entry.timestamp ?? nowIso(),
      });
    },
    async query(filter) {
      const result = await services.repos.audit.listByFilter(filter);
      return {
        total: result.total,
        items: result.items.map((item) => ({
          action: item.action,
          actorId: item.actorId,
          entityId: item.entityId,
          teamId: item.teamId ?? undefined,
          metadata: item.payload,
          timestamp: item.createdAt,
        })),
      };
    },
  };
}

function createQueuePorts(services: SkillShareerServices): QueuePorts {
  if (services.asyncTransport) {
    return {
      task: services.asyncTransport.task,
      outbox: services.asyncTransport.events,
    };
  }

  return {
    task: {
      kind: 'postgres-task-queue',
      async enqueue() {
        return `job_${randomUUID()}`;
      },
      async requeue() {},
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
        return `evt_${randomUUID()}`;
      },
      async claimBatch() {
        return [];
      },
      async complete() {},
      async fail() {},
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

function createRetrievalQuery(services: SkillShareerServices): RetrievalQueryPort {
  return {
    async search(params) {
      const auth: ResolvedAuthContext = {
        subjectType: 'system-admin',
        actorId: 'nest-light-runtime',
        handle: 'nest-light-runtime',
        activeTeamId: params.teamId ?? null,
        securityLevel: Number.MAX_SAFE_INTEGER,
        effectivePermissions: resolveEffectivePermissions('system-admin', []),
        user: null,
        membership: null,
        team: null,
      };

      const result = await searchKnowledge(services, auth, {
        seed: params.query,
        mode: 'hybrid',
        maxResults: params.limit ?? 10,
      });

      const rows = [...result.globalConstraints, ...result.projectKnowledge];
      return {
        results: rows.map((row) => ({
          entryId: row.entryId,
          score: row.score,
          snippet: row.detail,
        })),
        totalEstimate: rows.length,
        channel: result.routingTrace.channelsUsed.join(','),
      };
    },
  };
}

export async function createHostLocalRuntime(): Promise<HostLocalRuntime> {
  const serverConfig = loadServerConfigBridge().serverConfig;
  const config: ServerConfig = {
    ...serverConfig,
  };
  const runtimeDeployment = resolveRuntimeDeployment({
    preset: config.deployment.preset,
    ...(config.deployment.profile ? { profile: config.deployment.profile } : {}),
    ...(config.deployment.resolved?.runtimeMode
      ? { runtimeMode: config.deployment.resolved.runtimeMode }
      : {}),
    ...(config.deployment.resolved?.serviceUnit
      ? { serviceUnit: resolveServiceUnit(config.deployment.resolved.serviceUnit) }
      : {}),
  });
  config.deployment.resolved = runtimeDeployment;

  const store = createSkillShareerStore({
    dataFile: config.dataFile,
    databaseUrl: config.databaseUrl,
  });
  const pool = store instanceof PostgresStore ? store.getPool() : undefined;
  const repos = await createAllRepos(pool ? { store, pool } : { store });
  const asyncTransport = pool ? createAsyncTransport({ config, pool }) : undefined;

  const channelRegistry = new ChannelRegistry();
  channelRegistry.register(semanticChannel);
  channelRegistry.register(keywordChannel);

  const strategyRegistry = new StrategyRegistry();
  const semanticStrategy: RetrievalStrategy = {
    version: 'semantic',
    async execute(query, _channels, eligibleEntries, services, auth) {
      return semanticRecall(query.seed, eligibleEntries, query, services, auth);
    },
  };
  const hybridStrategy: RetrievalStrategy = {
    version: 'hybrid',
    async execute(query, _channels, eligibleEntries, services, auth) {
      return hybridRecall(query.seed, eligibleEntries, query, services, auth);
    },
  };
  const graphAssistedStrategy: RetrievalStrategy = {
    version: 'graph-assisted',
    async execute(query, _channels, eligibleEntries, services) {
      return graphAssistedRecall(query.seed, eligibleEntries, query, services);
    },
  };
  strategyRegistry.register(semanticStrategy);
  strategyRegistry.register(hybridStrategy);
  strategyRegistry.register(graphAssistedStrategy);

  const graphQueryBackend = createMemoryGraphQueryBackend(repos.graphIndex);
  const services: SkillShareerServices = {
    config,
    runtimeDeployment,
    runtimeMode: runtimeDeployment.runtimeMode,
    serviceUnit: runtimeDeployment.serviceUnit,
    store,
    ...(asyncTransport ? { asyncTransport } : {}),
    adapterRegistry: buildDefaultAdapterRegistry(),
    channelRegistry,
    strategyRegistry,
    ai: createAiProviders(config.ai),
    knowledgeRepo: repos.knowledge,
    artifactRepo: repos.artifact,
    sessionRepo: repos.session,
    accessKeyRepo: repos.accessKey,
    userRepo: repos.user,
    teamRepo: repos.team,
    membershipRepo: repos.membership,
    usageAnalyticsRepo: repos.usageAnalytics,
    repos,
    graphQueryBackend,
    graphQuery: {
      backendKind: 'memory',
      enabled: false,
      failOpen: true,
      mode: 'disabled',
      syncOnWrite: false,
    },
    eventBus: new LifecycleEventBus(),
  };

  setGlobalEmbeddingsProvider(services.ai.embeddings);

  const runtime: HostLocalRuntime = {
    services,
    retrievalQuery: createRetrievalQuery(services),
    sessionLookup: createSessionLookup(services),
    teamLookup: createTeamLookup(services),
    permissionCheck: createPermissionCheck(services),
    auditLog: createAuditLog(services),
    queuePorts: createQueuePorts(services),
  };

  return runtime;
}
