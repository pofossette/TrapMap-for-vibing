import { loadServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import {
  createKnowledgeReadDeps,
  createKnowledgeReadServer,
} from '@trapmap/service-knowledge-read';

/**
 * Bootstrap the knowledge-read service as a standalone process.
 *
 * Loads configuration from environment variables, creates the
 * database pool, assembles the Fastify server, and starts listening.
 */
export async function start() {
  const config = loadServiceConfig('knowledge-read');
  const db = createServiceDatabase(config);
  const ports = createServicePorts(db.pool);
  const deps = createKnowledgeReadDeps({
    knowledgeRepo: ports.repos.knowledge,
    retrievalQuery: ports.retrievalQuery,
  });
  const server = await createKnowledgeReadServer(config, deps);
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'knowledge-read');
  await server.start();
  return { config, db, server };
}
