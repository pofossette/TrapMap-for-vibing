import type { Permission, RoleTemplate } from '@trapmap/contracts';
import { permissionSchema } from '@trapmap/contracts';

import type { ResolvedAuthContext } from './context.js';
import { AppError } from './errors.js';

const ALL_PERMISSIONS = [...permissionSchema.options];

const ROLE_TEMPLATE_PERMISSIONS: Record<RoleTemplate, Permission[]> = {
  user: ['session:read', 'team:list', 'team:select', 'knowledge:submit', 'knowledge:search'],
  admin: [...ALL_PERMISSIONS],
  'system-admin': [...ALL_PERMISSIONS],
};

export function resolveEffectivePermissions(
  roleTemplate: RoleTemplate,
  explicitPermissions: Permission[],
): Permission[] {
  return [...new Set([...ROLE_TEMPLATE_PERMISSIONS[roleTemplate], ...explicitPermissions])];
}

function hasPermission(auth: ResolvedAuthContext, permission: Permission): boolean {
  return auth.effectivePermissions.includes(permission);
}

export function requirePermission(auth: ResolvedAuthContext, permission: Permission): void {
  if (!hasPermission(auth, permission)) {
    throw new AppError(403, 'forbidden', `Missing required permission: ${permission}`);
  }
}

export function requireTeamAccess(auth: ResolvedAuthContext, teamId: string): void {
  if (auth.subjectType === 'system-admin') {
    return;
  }

  if (auth.localSingleUserMode) {
    return;
  }

  if (auth.activeTeamId !== teamId) {
    throw new AppError(403, 'team_mismatch', 'Active session is not scoped to the requested team');
  }
}

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
