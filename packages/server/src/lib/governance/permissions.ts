/**
 * Permission helpers and context extraction for governance.
 * Bridges ResolvedAuthContext to GovernanceContext.
 */

import type { Permission } from '@trapmap/contracts';
import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import type { GovernanceContext } from './types.js';

/**
 * Extract governance context from resolved auth context.
 * Creates a minimal context object for governance decisions.
 */
export function extractGovernanceContext(auth: ResolvedAuthContext): GovernanceContext {
  return {
    teamId: auth.activeTeamId,
    securityLevel: auth.securityLevel,
    isSystemAdmin: auth.subjectType === 'system-admin',
  };
}

/**
 * Check if auth context has a specific permission.
 * Re-exports from rbac.ts for unified governance module.
 */
export function hasPermission(auth: ResolvedAuthContext, permission: Permission): boolean {
  return auth.effectivePermissions.includes(permission);
}

/**
 * Require a specific permission, throwing if not present.
 */
export function requirePermission(auth: ResolvedAuthContext, permission: Permission): void {
  if (!hasPermission(auth, permission)) {
    throw new AppError(403, 'forbidden', `Missing required permission: ${permission}`);
  }
}

/**
 * Require team access for team-scoped resources.
 * System admins bypass this check.
 */
export function requireTeamAccess(auth: ResolvedAuthContext, teamId: string): void {
  if (auth.subjectType === 'system-admin') {
    return;
  }

  if (auth.activeTeamId !== teamId) {
    throw new AppError(403, 'team_mismatch', 'Active session is not scoped to the requested team');
  }
}

/**
 * Require strictly higher security level than target.
 * Used for operations like reviewing entries.
 */
export function requireHigherLevel(
  auth: ResolvedAuthContext,
  targetLevel: number,
  nextLevel: number = targetLevel,
): void {
  if (auth.subjectType === 'system-admin') {
    return;
  }

  if (auth.securityLevel <= targetLevel || auth.securityLevel <= nextLevel) {
    throw new AppError(
      403,
      'insufficient_level',
      'Operation requires a strictly higher security level than the target member',
    );
  }
}
