/**
 * Knowledge-write service entry point.
 *
 * Exports the server factory and a convenience `start()` function
 * that loads config, connects to the database, and boots the server.
 */

export { createServer } from './server.js';
export { createKnowledgeWriteDeps } from './ports.js';

import { loadServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createServer } from './server.js';

/**
 * Boot the knowledge-write service as a standalone process.
 *
 * Loads configuration from environment variables, creates a database
 * pool, assembles the Fastify server, and starts listening.
 */
export async function start() {
  const config = loadServiceConfig('knowledge-write');
  const db = createServiceDatabase(config);
  const server = await createServer(config, db);
  await server.start();
  return { config, db, server };
}
