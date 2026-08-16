/**
 * Start the governance-review distributed service.
 *
 * Phase 3 convergence: delegate to the distributed assembly profile (builds
 * the config/database/governance-review server nodes and boots them).
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startGovernanceReviewService() {
  return startDistributedService('governance-review');
}
