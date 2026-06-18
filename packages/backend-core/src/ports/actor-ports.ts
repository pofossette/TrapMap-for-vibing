/**
 * Actor and auth lookup port interfaces.
 *
 * These ports define the contract for authentication and authorization
 * lookups required by backend-core use-cases. They are host-agnostic --
 * host assemblies wire them to session stores, team repositories, or
 * external identity providers.
 */

import type { Permission } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Session lookup port
// ---------------------------------------------------------------------------

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  handle: string;
  activeTeamId: string | null;
  securityLevel: number;
}

export interface SessionLookupPort {
  /**
   * Resolve a session token to a session object.
   * Returns null if the token is invalid or expired.
   */
  resolveSession(sessionToken: string): Promise<ResolvedSession | null>;
}

// ---------------------------------------------------------------------------
// Team lookup port
// ---------------------------------------------------------------------------

export interface ResolvedTeamContext {
  teamId: string;
  slug: string;
  [key: string]: unknown;
}

export interface TeamLookupPort {
  /**
   * Look up team details by team ID.
   * Returns null if the team does not exist.
   */
  getTeam(teamId: string): Promise<ResolvedTeamContext | null>;

  /**
   * List teams the given user has access to.
   */
  listTeamsForUser(userId: string): Promise<ResolvedTeamContext[]>;
}

// ---------------------------------------------------------------------------
// Permission check port
// ---------------------------------------------------------------------------

export interface PermissionCheckPort {
  /**
   * Resolve the effective permissions for a user in a given team context.
   */
  resolvePermissions(userId: string, teamId: string | null): Promise<Permission[]>;

  /**
   * Check whether a user has a specific permission in a team context.
   */
  hasPermission(userId: string, teamId: string | null, permission: Permission): Promise<boolean>;
}
