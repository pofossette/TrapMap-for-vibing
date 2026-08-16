/**
 * Bootstrap the knowledge-read service as a standalone process.
 *
 * Phase 3 convergence: the legacy loadServiceConfig → createServiceDatabase →
 * createServicePorts → create<X>Server sequence moved into the distributed
 * assembly layers (config/database nodes + the knowledge-read server node);
 * this starter is now a thin caller of the shared profile boot.
 */
import { startDistributedService } from '../assembly/profiles/distributed.js';

export async function startKnowledgeReadService() {
  return startDistributedService('knowledge-read');
}
