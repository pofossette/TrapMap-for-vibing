/**
 * Gateway service entry point.
 *
 * The gateway is the ONLY externally-exposed service.
 * It forwards requests to internal services via HTTP.
 */

export { createServer } from './server.js';
export { registerGatewayRoutes } from './routes.js';
export { createInternalServiceClients } from './internal-client.js';
export type { InternalServiceClients } from './internal-client.js';

import { loadServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createServer } from './server.js';

/**
 * Start the gateway service.
 */
export async function start() {
  const config = loadServiceConfig('gateway');
  const server = await createServer(config);
  await server.start();
  return { config, server };
}
