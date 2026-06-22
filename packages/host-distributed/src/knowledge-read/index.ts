/**
 * Knowledge-read service entry point.
 *
 * Re-exports the building blocks for composition and provides a
 * standalone start() function for process-level bootstrapping.
 */

export { createServer } from './server.js';
export { registerRoutes } from './routes.js';
export { createKnowledgeReadDeps } from './ports.js';

import { loadServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createServer } from './server.js';

/**
 * Bootstrap the knowledge-read service as a standalone process.
 *
 * Loads configuration from environment variables, creates the
 * database pool, assembles the Fastify server, and starts listening.
 */
export async function start() {
  const config = loadServiceConfig('knowledge-read');
  const db = createServiceDatabase(config);
  const server = await createServer(config, db);
  await server.start();
  return { config, db, server };
}
