/**
 * Identity & Access bounded-context module.
 *
 * Owns: authentication, sessions, permissions, team membership, access keys.
 * This module defines the contract for identity and access operations
 * that host assemblies implement.
 */

import { InvocationError } from '../invocation/invocation-model.js';
import type {
  PermissionCheckPort,
  SessionLookupPort,
  TeamLookupPort,
} from '../ports/actor-ports.js';
import type { AuditLogPort } from '../ports/audit-ports.js';
import type { IdentityAccessPort } from '../ports/internal-ports.js';
import type {
  AccessKeyRepositoryPort,
  MembershipRepositoryPort,
  SessionRepositoryPort,
  TeamRepositoryPort,
  UserRepositoryPort,
} from '../ports/repo-ports.js';

// ---------------------------------------------------------------------------
// Module dependencies (injected by host assembly)
// ---------------------------------------------------------------------------

export interface IdentityAccessDeps {
  sessionRepo: SessionRepositoryPort;
  accessKeyRepo: AccessKeyRepositoryPort;
  teamRepo: TeamRepositoryPort;
  membershipRepo: MembershipRepositoryPort;
  userRepo: UserRepositoryPort;
  sessionLookup: SessionLookupPort;
  teamLookup: TeamLookupPort;
  permissionCheck: PermissionCheckPort;
  auditLog: AuditLogPort;
}

// ---------------------------------------------------------------------------
// Module descriptor
// ---------------------------------------------------------------------------

/**
 * Service ownership declaration for the identity-access module.
 * This is consumed by the service topology to determine which
 * service unit owns these capabilities.
 */
export const IDENTITY_ACCESS_MODULE = {
  name: 'identity-access' as const,
  owns: ['auth', 'session', 'permissions', 'team-membership', 'access-keys'] as const,
  dependsOn: [] as const,
} as const;

/**
 * Create an IdentityAccessPort backed by the given dependencies.
 * This is the factory that host assemblies call to wire the module.
 */
export function createIdentityAccessModule(deps: IdentityAccessDeps): IdentityAccessPort {
  return {
    async login(handle: string, _password: string) {
      const user = await deps.userRepo.getByHandle(handle);
      if (!user) {
        throw InvocationError.notFound(`User not found: ${handle}`);
      }
      const session = await deps.sessionRepo.create({
        userId: user.id,
        tokenHash: `hash_${Date.now()}`,
        activeTeamId: null,
      } as Parameters<SessionRepositoryPort['create']>[0]);
      return {
        sessionToken: session.tokenHash,
        userId: user.id,
        handle: user.handle,
      };
    },

    async logout(sessionToken: string) {
      await deps.sessionRepo.deleteByTokenHash(sessionToken);
    },

    async selectTeam(sessionToken: string, teamId: string) {
      const session = await deps.sessionRepo.getByTokenHash(sessionToken);
      if (!session) {
        throw InvocationError.notFound('Session not found');
      }
      await deps.sessionRepo.updateActiveTeam(session.id, teamId);
    },

    async createTeam(name: string, slug: string, actorId: string) {
      const teamId = await deps.teamRepo.nextId();
      await deps.teamRepo.insert({
        id: teamId,
        slug,
        name,
      } as Parameters<TeamRepositoryPort['insert']>[0]);
      await deps.auditLog.record({
        action: 'team.create',
        actorId,
        entityId: teamId,
      });
      return { teamId };
    },

    async listTeams(userId: string) {
      const memberships = await deps.membershipRepo.listByUser(userId);
      const teams = await Promise.all(memberships.map((m) => deps.teamRepo.getById(m.teamId)));
      return teams
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .map((t) => ({
          id: t.id,
          slug: t.slug,
          name: ((t as Record<string, unknown>).name as string) ?? t.slug,
        }));
    },

    async addMember(teamId: string, userId: string, role: string, actorId: string) {
      const memberId = await deps.membershipRepo.nextId();
      await deps.membershipRepo.insert({
        id: memberId,
        userId,
        teamId,
        role,
      } as Parameters<MembershipRepositoryPort['insert']>[0]);
      await deps.auditLog.record({
        action: 'member.add',
        actorId,
        entityId: memberId,
        teamId,
      });
    },

    async updateMember(memberId: string, updates: Record<string, unknown>, actorId: string) {
      await deps.membershipRepo.update(
        memberId,
        updates as Parameters<MembershipRepositoryPort['update']>[1],
      );
      await deps.auditLog.record({
        action: 'member.update',
        actorId,
        entityId: memberId,
      });
    },

    async provisionAccessKey(memberId: string, actorId: string) {
      const keyId = await deps.accessKeyRepo.nextId();
      const token = `ak_${keyId}_${Date.now()}`;
      await deps.accessKeyRepo.insert({
        id: keyId,
        tokenHash: `hash_${token}`,
        memberId,
      } as Parameters<AccessKeyRepositoryPort['insert']>[0]);
      await deps.auditLog.record({
        action: 'access-key.provision',
        actorId,
        entityId: keyId,
      });
      return { keyId, token };
    },
  };
}
