/**
 * Gateway service server.
 *
 * The gateway is the ONLY externally-exposed service. It receives
 * public API requests and forwards them to internal services via HTTP.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { type InternalServiceClients, createInternalServiceClients } from './internal-client.js';
import { registerGatewayRoutes } from './routes.js';

// ---------------------------------------------------------------------------
// Server interface
// ---------------------------------------------------------------------------

export interface GatewayServer {
  app: FastifyInstance;
  clients: InternalServiceClients;
  start(): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the gateway server.
 *
 * The gateway does NOT have its own database. It delegates all
 * operations to internal services via HTTP.
 */
export async function createServer(config: ServiceConfig): Promise<GatewayServer> {
  const app = Fastify({ logger: { level: config.logLevel } });

  // Create HTTP clients for all internal services
  const clients = createInternalServiceClients(config.internalUrls);

  // Register gateway routes (external API surface)
  registerGatewayRoutes(app, clients);

  return {
    app,
    clients,
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      await app.close();
    },
  };
}
