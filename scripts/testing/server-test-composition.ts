/**
 * Test server composition for integration and eval tests.
 *
 * Wraps the host-local Nest composition for tests that need a full
 * PostgreSQL-backed server instance.
 */

import { loadConfig } from '../../packages/host-local/src/nest/config/config.js';
import {
  type PostgresComposedServer,
  buildPostgresComposedServer,
} from './postgres-server-composition.js';

/**
 * Build a test server backed by PostgreSQL using the host-local Nest host.
 * Requires TRAPMAP_DATABASE_URL in the environment.
 */
export async function buildPostgresTestServer(
  options: { logger?: boolean } = {},
): Promise<PostgresComposedServer> {
  const config = loadConfig();
  if (!config.databaseUrl) {
    throw new Error('PostgreSQL test composition requires TRAPMAP_DATABASE_URL');
  }
  return buildPostgresComposedServer(config.databaseUrl, options);
}
