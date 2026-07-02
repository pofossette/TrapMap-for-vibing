/**
 * Gateway service server.
 *
 * The gateway is the ONLY externally-exposed service. It receives
 * public API requests and forwards them to internal services via HTTP.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import { DynamicDiscovery } from '@trapmap/backend-core';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { ConsulDiscoveryAdapter } from './consul-discovery-adapter.js';
import { DiscoveryResolver } from './discovery-resolver.js';
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
 *
 * When `config.consulEnabled` is true, service URLs are resolved
 * dynamically via Consul (with cached discovery + static fallback).
 * Otherwise only static env-var-based URLs are used.
 */
export async function createServer(config: ServiceConfig): Promise<GatewayServer> {
  const app = Fastify({ logger: { level: config.logLevel } });

  // Optional: set up dynamic discovery via Consul
  let resolver: DiscoveryResolver | undefined;

  if (config.consulEnabled) {
    // Adapt FastifyBaseLogger (which uses .info()) to the { warn, debug, log } shape
    const logger = {
      warn: (msg: string) => app.log.warn(msg),
      debug: (msg: string) => app.log.debug(msg),
      log: (msg: string) => app.log.info(msg),
    };

    const adapter = new ConsulDiscoveryAdapter({
      consulAddress: config.consulAddress,
      logger,
    });

    // DynamicDiscovery wraps the adapter with TTL cache + round-robin.
    // DiscoveryResolver provides the static-URL fallback layer.
    const dynamicDiscovery = new DynamicDiscovery(adapter, { cacheTTLMs: 30_000 });

    resolver = new DiscoveryResolver({
      discovery: dynamicDiscovery,
      staticUrls: config.internalUrls,
      logger,
    });

    // Register this gateway instance with Consul
    await adapter.register({
      id: `trapmap-gateway-${process.pid}`,
      name: 'gateway',
      address: config.host,
      port: config.port,
      check: {
        http: `http://${config.host}:${config.port}/health`,
        interval: '10s',
        timeout: '5s',
      },
      meta: {
        version: process.env.npm_package_version ?? '0.1.0',
        environment: process.env.NODE_ENV ?? 'development',
      },
    });
  }

  // Create HTTP clients for all internal services
  const clients = createInternalServiceClients(config.internalUrls, resolver);

  // Register gateway routes (external API surface)
  registerGatewayRoutes(app, clients);

  return {
    app,
    clients,
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      // Deregister from Consul if we registered
      if (config.consulEnabled) {
        try {
          const adapter = new ConsulDiscoveryAdapter({
            consulAddress: config.consulAddress,
            logger: {
              warn: (msg: string) => app.log.warn(msg),
              debug: (msg: string) => app.log.debug(msg),
              log: (msg: string) => app.log.info(msg),
            },
          });
          await adapter.deregister(`trapmap-gateway-${process.pid}`);
        } catch {
          // Best-effort deregistration — never block shutdown
        }
      }
      await app.close();
    },
  };
}
