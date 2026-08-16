/**
 * Start the cron-scheduler distributed service.
 *
 * Phase 3 convergence: delegate to the distributed assembly profile (builds
 * the config/database/cron server nodes and boots them).
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startCronService() {
  return startDistributedService('cron-scheduler');
}
