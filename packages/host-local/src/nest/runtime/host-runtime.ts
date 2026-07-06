import type {
  PermissionCheckPort,
  QueuePorts,
  ResolvedSession,
  RetrievalQueryPort,
  SessionLookupPort,
  TeamLookupPort,
} from '@trapmap/backend-core';
import type { Permission } from '@trapmap/contracts';
import {
  createKnowledgeReadRetrievalQuery,
  type KnowledgeReadRetrievalQueryOptions,
} from '@trapmap/service-knowledge-read';
import type { FastifyRequest } from 'fastify';

import { loadHostLocalConfig } from '../config/index.js';
import { createAuditLogPort, createQueuePorts } from './backend-core-adapters.js';
import { createHostLocalServices, type HostLocalServices } from './host-services.js';
import { resolveHostLocalAuthContext } from './auth-context.js';
import { resolveEffectivePermissions } from './permissions.js';

export const HOST_LOCAL_RUNTIME_TOKEN = 'HOST_LOCAL_RUNTIME';

export interface HostLocalRuntime {
  services: HostLocalServices;
  retrievalQuery: RetrievalQueryPort;
  sessionLookup: SessionLookupPort;
  teamLookup: TeamLookupPort;
  permissionCheck: PermissionCheckPort;
  auditLog: ReturnType<typeof createAuditLogPort>;
  queuePorts: QueuePorts;
}

type HostLocalKnowledgeReadServices = KnowledgeReadRetrievalQueryOptions['services'];

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

function createRetrievalQuery(services: HostLocalServices): RetrievalQueryPort {
  const retrievalServices = services as unknown as HostLocalKnowledgeReadServices;

  return createKnowledgeReadRetrievalQuery({
    services: retrievalServices,
    resolveAuthContext(params) {
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
    auditLog: createAuditLogPort(services.repos),
    queuePorts: createQueuePorts(services.asyncTransport),
  };

  return runtime;
}
