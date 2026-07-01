import type { Permission, RoleTemplate } from '@trapmap/contracts';
import { permissionSchema } from '@trapmap/contracts';

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
