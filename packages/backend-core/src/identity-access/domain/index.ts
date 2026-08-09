/**
 * Identity-access bounded context — domain layer.
 *
 * Pure policy rules (role-to-permission mapping, session security levels,
 * membership normalization, access-key hashing / token composition) with
 * zero framework, DB or I/O imports. The application layer and the
 * PostgreSQL owner consume these rules instead of embedding them.
 */

export const IDENTITY_ACCESS_CONTEXT = 'identity-access' as const;

export const IDENTITY_ACCESS_OWNED_CAPABILITIES = [
  'auth',
  'session',
  'permissions',
  'team-membership',
  'access-keys',
] as const;

export * from './policy.js';
export * from './access-key.js';
