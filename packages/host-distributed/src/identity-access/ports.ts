/**
 * Wire IdentityAccessDeps from the shared service port implementations.
 *
 * Maps the generic shared ports into the specific dependency shape
 * expected by createIdentityAccessModule from backend-core.
 */

import type { IdentityAccessDeps } from '@trapmap/backend-core';
import type { ServicePortImplementations } from '@trapmap/host-distributed/shared/ports.js';

/**
 * Create the dependency object required by the identity-access backend-core module.
 *
 * Extracts only the ports that identity-access actually needs from the
 * full set of service port implementations.
 */
export function createIdentityAccessDeps(ports: ServicePortImplementations): IdentityAccessDeps {
  return {
    sessionRepo: ports.repos.session,
    accessKeyRepo: ports.repos.accessKey,
    teamRepo: ports.repos.team,
    membershipRepo: ports.repos.membership,
    userRepo: ports.repos.user,
    sessionLookup: ports.sessionLookup,
    teamLookup: ports.teamLookup,
    permissionCheck: ports.permissionCheck,
    auditLog: ports.auditLog,
  };
}
