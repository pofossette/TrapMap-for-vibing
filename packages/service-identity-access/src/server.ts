import type { IdentityAccessPort } from '@trapmap/backend-core';
import { createFastifyAdapter } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';
import { type IdentityAccessDeps, createIdentityAccessServiceModule } from './deps.js';
import { createIdentityAccessRouteDefs } from './routes.js';

export interface IdentityAccessServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface IdentityAccessServer {
  app: FastifyInstance;
  module: IdentityAccessPort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createIdentityAccessServer(
  config: IdentityAccessServiceConfig,
  deps: IdentityAccessDeps,
): Promise<IdentityAccessServer> {
  const module = createIdentityAccessServiceModule(deps);
  const app = createFastifyAdapter(createIdentityAccessRouteDefs(module), module, {
    logger: { level: config.logLevel },
  });

  return {
    app,
    module,
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      await app.close();
    },
  };
}
