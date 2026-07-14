import { type IdentityAccessDeps, createIdentityAccessModule } from '@trapmap/backend-core';

import type { IdentityActorLookupSource } from './actor-lookup.js';

export type { IdentityAccessDeps } from '@trapmap/backend-core';

export interface IdentityAccessPortDeps {
  sessionRepo: IdentityAccessDeps['sessionRepo'];
  accessKeyRepo: IdentityAccessDeps['accessKeyRepo'];
  teamRepo: IdentityAccessDeps['teamRepo'];
  membershipRepo: IdentityAccessDeps['membershipRepo'];
  userRepo: IdentityAccessDeps['userRepo'];
  sessionLookup: IdentityAccessDeps['sessionLookup'];
  teamLookup: IdentityAccessDeps['teamLookup'];
  permissionCheck: IdentityAccessDeps['permissionCheck'];
  auditLog: IdentityAccessDeps['auditLog'];
  actorLookup: IdentityActorLookupSource;
  systemAdminKey?: IdentityAccessDeps['systemAdminKey'];
}

export function createIdentityAccessDeps(deps: IdentityAccessPortDeps): IdentityAccessDeps {
  return {
    sessionRepo: deps.sessionRepo,
    accessKeyRepo: deps.accessKeyRepo,
    teamRepo: deps.teamRepo,
    membershipRepo: deps.membershipRepo,
    userRepo: deps.userRepo,
    sessionLookup: deps.sessionLookup,
    teamLookup: deps.teamLookup,
    permissionCheck: deps.permissionCheck,
    auditLog: deps.auditLog,
    ...(deps.systemAdminKey !== undefined ? { systemAdminKey: deps.systemAdminKey } : {}),
  };
}

export function createIdentityAccessServiceModule(deps: IdentityAccessDeps) {
  return createIdentityAccessModule(deps);
}
