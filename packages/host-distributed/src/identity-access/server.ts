import { createIdentityAccessModule } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import { createIdentityAccessDeps } from './ports.js';
import { registerRoutes } from './routes.js';

export interface IdentityAccessServer {
  app: FastifyInstance;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<IdentityAccessServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const ports = createServicePorts(db.pool);
  const deps = createIdentityAccessDeps(ports);
  const module = createIdentityAccessModule(deps);
  registerRoutes(app, module);
  return {
    app,
    async start() {
      await app.listen({ port: config.port, host: config.host });
    },
    async close() {
      await app.close();
    },
  };
}
