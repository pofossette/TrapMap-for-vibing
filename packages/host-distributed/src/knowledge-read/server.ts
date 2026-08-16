/**
 * Host adapter for the knowledge-read service (Phase 3 convergence).
 *
 * Mirrors the other per-service host adapters: `createServer(config, db)`
 * builds the knowledge-read server from the shared dB pool and exposed deps,
 * attaching metrics + telemetry. The legacy bootstrap logic that lived in
 * `index.ts` moved here so the distributed profile can wire it as a node.
 */
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import {
  createKnowledgeReadDeps,
  createKnowledgeReadServer,
} from '@trapmap/service-knowledge-read';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): ReturnType<typeof createKnowledgeReadServer> {
  const identity = createIdentityAccessPgDeps(db.pool, { systemAdminKey: config.systemAdminKey });
  const ports = createServicePorts(db.pool, config.serviceName, identity);
  const deps = createKnowledgeReadDeps({
    knowledgeRepo: ports.repos.knowledge,
    retrievalQuery: ports.retrievalQuery,
  });
  const server = await createKnowledgeReadServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'knowledge-read');
  return server;
}
