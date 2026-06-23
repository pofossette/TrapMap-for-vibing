import type { IdentityAccessPort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import { type IdentityAccessDeps, createIdentityAccessServiceModule } from './deps.js';
import { registerIdentityAccessRoutes } from './routes.js';

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
  const app = Fastify({ logger: { level: config.logLevel } });
  const module = createIdentityAccessServiceModule(deps);
  registerIdentityAccessRoutes(app, module);

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
