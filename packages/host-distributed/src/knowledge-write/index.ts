/**
 * Knowledge-write service entry point.
 *
 * Exports the server factory and a convenience bootstrap function
 * that loads config, connects to the database, and boots the server.
 */

/**
 * Boot the knowledge-write service as a standalone process.
 *
 * Phase 3 convergence: delegate to the distributed assembly profile, which
 * composes the config/database/server nodes and boots them, returning the
 * same DistributedServiceHandle shape.
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startKnowledgeWriteService() {
  return startDistributedService('knowledge-write');
}
