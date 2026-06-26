/**
 * Identity-access bounded context — domain layer.
 *
 * Phase 2 target: pure domain types, invariants and policy helpers that
 * do not depend on any port, framework, or infrastructure concern.
 *
 * Currently the business rules for this context live entirely behind the
 * port seam in `application/module.ts`; this file is the designated home
 * for any future pure-domain extraction (entities, value objects, policy).
 */

export const IDENTITY_ACCESS_CONTEXT = 'identity-access' as const;

export const IDENTITY_ACCESS_OWNED_CAPABILITIES = [
  'auth',
  'session',
  'permissions',
  'team-membership',
  'access-keys',
] as const;
