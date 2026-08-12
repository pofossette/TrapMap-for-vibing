/**
 * Identity-access bounded context — policy rules.
 *
 * Pure permission, security-level and normalization policy with zero
 * framework / DB / I/O imports. The PostgreSQL owner renders these rules
 * into lookups; the application layer uses them for session / access-key
 * issuance decisions.
 */

import type { Permission } from '@trapmap/contracts';

export const SYSTEM_ADMIN_SECURITY_LEVEL = 10 as const;

export const USER_SECURITY_LEVEL = 1 as const;

/** Security level granted to a resolved session by subject type. */
export function sessionSecurityLevel(subjectType: 'system-admin' | 'user'): number {
  return subjectType === 'system-admin' ? SYSTEM_ADMIN_SECURITY_LEVEL : USER_SECURITY_LEVEL;
}

/**
 * Effective permissions for a membership role. Admin and system-admin share
 * the full capability set; editors get write capabilities; everyone else
 * reads.
 */
export function permissionsForRole(role: string): Permission[] {
  const read: Permission[] = ['session:read', 'team:list', 'knowledge:search'];
  if (role === 'admin' || role === 'system-admin') {
    return [
      ...read,
      'team:create',
      'team:select',
      'member:create',
      'member:update',
      'member:key:create',
      'knowledge:submit',
      'knowledge:review',
      'knowledge:update',
      'knowledge:export',
      'knowledge:import',
      'audit:read',
      'stats:read',
    ];
  }
  if (role === 'editor') {
    return [...read, 'team:select', 'knowledge:submit', 'knowledge:update', 'knowledge:export'];
  }
  return read;
}

/** Membership role template falls back to the default user role. */
export function defaultRoleTemplate(legacyRole: string | null | undefined): string {
  return legacyRole ?? 'user';
}

/** Membership security level falls back to the base level. */
export function defaultSecurityLevel(level: number | null | undefined): number {
  return level ?? 0;
}

/** Team display name falls back to the slug. */
export function defaultTeamName(name: string | null | undefined, slug: string): string {
  return name ?? slug;
}
