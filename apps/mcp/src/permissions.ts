/**
 * Role model and gate for TrapMap MCP tools (Task B5).
 *
 * Roles are ordered least → most privileged. Every tool declares the minimum
 * role it needs; access is DENY-BY-DEFAULT.
 *
 * Role source: `TRAPMAP_MCP_ROLE` env (validated), falling back to `viewer`.
 * The gateway remains the authoritative permission boundary — this client-side
 * gate exists so agent sessions fail fast and never ship under-privileged
 * calls to the wire.
 */
export type Role = 'viewer' | 'contributor' | 'reviewer' | 'operator';

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  contributor: 1,
  reviewer: 2,
  operator: 3,
};

export class PermissionDeniedError extends Error {
  constructor(required: Role, actual: Role) {
    super(`permission denied: tool requires role "${required}", session has "${actual}"`);
    this.name = 'PermissionDeniedError';
  }
}

export function assertRole(actual: Role, required: Role): void {
  if (ROLE_RANK[actual] < ROLE_RANK[required]) {
    throw new PermissionDeniedError(required, actual);
  }
}

const ROLES = Object.keys(ROLE_RANK) as Role[];

export function resolveSessionRole(env: Record<string, string | undefined>): Role {
  const raw = env.TRAPMAP_MCP_ROLE;
  return typeof raw === 'string' && (ROLES as string[]).includes(raw) ? (raw as Role) : 'viewer';
}
