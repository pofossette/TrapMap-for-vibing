import Fastify, { type FastifyInstance } from 'fastify';
import { createJobRuntimeModule } from '@trapmap/backend-core';
import type { ServiceConfig } from '../config/index.js';
import type { ServiceDatabase } from '../shared/database.js';
import { createJobRuntimeDeps } from './ports.js';
import { registerRoutes } from './routes.js';
import { createServicePorts } from '../shared/ports.js';

export interface JobRuntimeServer {
  app: FastifyInstance;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createServer(config: ServiceConfig, db: ServiceDatabase): Promise<JobRuntimeServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const ports = createServicePorts(db.pool);
  const deps = createJobRuntimeDeps(ports);
  const module = createJobRuntimeModule(deps);
  registerRoutes(app, module);
  return {
    app,
    async start() { await app.listen({ port: config.port, host: config.host }); },
    async close() { await app.close(); },
  };
}
