/**
 * Start the job-runtime distributed service (worker container).
 *
 * Phase 3 convergence: delegate to the distributed assembly profile, whose
 * job-runtime case composes the service node plus its D7 worker sub-node
 * declarations and boots them, returning the same DistributedServiceHandle.
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startJobRuntimeService() {
  return startDistributedService('job-runtime');
}
