/**
 * Gateway service entry point.
 *
 * The gateway is the ONLY externally-exposed service.
 * It forwards requests to internal services via HTTP.
 *
 * Start the gateway service.
 *
 * Phase 3 convergence: delegate to the distributed assembly profile, which
 * composes the gateway transport node and boots it, returning the same
 * DistributedServiceHandle shape.
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startGatewayService() {
  return startDistributedService('gateway');
}
