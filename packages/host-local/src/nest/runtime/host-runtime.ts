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
import { createKnowledgeReadRetrievalQuery } from '@trapmap/service-knowledge-read';
import type { FastifyRequest } from 'fastify';

import { loadHostLocalConfig } from "@trapmap/host-local/nest/config/index.js";
import { createHostLocalServices, type HostLocalServices } from './host-services.js';
import { resolveHostLocalAuthContext } from './auth-context.js';
import { nowIso } from './now-iso.js';
import { resolveEffectivePermissions } from './permissions.js';

export const HOST_LOCAL_RUNTIME_TOKEN = 'HOST_LOCAL_RUNTIME';

export interface HostLocalRuntime {
  services: HostLocalServices;
  retrievalQuery: RetrievalQueryPort;
  sessionLookup: SessionLookupPort;
  teamLookup: TeamLookupPort;
  permissionCheck: PermissionCheckPort;
  auditLog: AuditLogPort;
  queuePorts: QueuePorts;
}

function createSessionLookup(services: HostLocalServices): SessionLookupPort {
  return {
    async resolveSession(sessionToken: string): Promise<ResolvedSession | null> {
      try {
        const auth = await resolveHostLocalAuthContext(services, {
          headers: { authorization: `Bearer ${sessionToken}` },
        } as FastifyRequest);
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

function createTeamLookup(services: HostLocalServices): TeamLookupPort {
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

function createPermissionCheck(services: HostLocalServices): PermissionCheckPort {
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

function createAuditLog(services: HostLocalServices): AuditLogPort {
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

function createQueuePorts(services: HostLocalServices): QueuePorts {
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

function createRetrievalQuery(services: HostLocalServices): RetrievalQueryPort {
  return createKnowledgeReadRetrievalQuery({
    services,
    resolveAuthContext(params): ResolvedAuthContext {
      return {
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
    },
    mode: 'hybrid',
  });
}

export async function createHostLocalRuntime(): Promise<HostLocalRuntime> {
  const config = loadHostLocalConfig();
  const services = await createHostLocalServices(config);

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
