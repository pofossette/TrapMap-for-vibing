/**
 * Gateway discovery factory.
 *
 * Assembles the discovery chain (ConsulDiscoveryAdapter -> DynamicDiscovery
 * -> DiscoveryResolver) once and reuses the same adapter for both
 * registration and deregistration.
 */

import { DynamicDiscovery } from '@trapmap/backend-core';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';

import { ConsulDiscoveryAdapter } from './consul-discovery-adapter.js';
import { DiscoveryResolver } from './discovery-resolver.js';

export interface GatewayDiscovery {
  resolver: DiscoveryResolver | undefined;
  register(): Promise<void>;
  deregister(): Promise<void>;
}

export function createGatewayDiscovery(
  config: ServiceConfig,
  logger: {
    warn: (msg: string) => void;
    debug: (msg: string) => void;
    log: (msg: string) => void;
  },
): GatewayDiscovery {
  if (!config.consulEnabled) {
    return {
      resolver: undefined,
      register: async () => {},
      deregister: async () => {},
    };
  }

  const adapter = new ConsulDiscoveryAdapter({
    consulAddress: config.consulAddress,
    logger,
  });

  // DynamicDiscovery wraps the adapter with TTL cache + round-robin.
  // DiscoveryResolver provides the static-URL fallback layer.
  const dynamicDiscovery = new DynamicDiscovery(adapter, { cacheTTLMs: 30_000 });

  const resolver = new DiscoveryResolver({
    discovery: dynamicDiscovery,
    staticUrls: config.internalUrls,
    logger,
  });

  const serviceId = `trapmap-gateway-${process.pid}`;

  return {
    resolver,
    async register() {
      // Register this gateway instance with Consul
      await adapter.register({
        id: serviceId,
        name: 'gateway',
        address: config.advertiseHost,
        port: config.port,
        check: {
          http: `http://${config.advertiseHost}:${config.port}/health`,
          interval: '10s',
          timeout: '5s',
        },
        meta: {
          version: process.env.npm_package_version ?? '0.1.0',
          environment: process.env.NODE_ENV ?? 'development',
        },
      });
    },
    async deregister() {
      await adapter.deregister(serviceId);
    },
  };
}
