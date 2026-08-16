/**
 * Start the identity-access distributed service.
 *
 * Phase 3 convergence: delegate to the distributed assembly profile (builds
 * config → database → server nodes and boots them) instead of re-wiring the
 * legacy loadServiceConfig/createServiceDatabase/createServer sequence here.
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startIdentityAccessService() {
  return startDistributedService('identity-access');
}
