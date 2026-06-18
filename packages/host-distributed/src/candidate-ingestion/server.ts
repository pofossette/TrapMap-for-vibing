import Fastify, { type FastifyInstance } from 'fastify';
import { createCandidateIngestionModule } from '@trapmap/backend-core';
import type { ServiceConfig } from '../config/index.js';
import type { ServiceDatabase } from '../shared/database.js';
import { createCandidateIngestionDeps } from './ports.js';
import { registerRoutes } from './routes.js';
import { createServicePorts } from '../shared/ports.js';

export interface CandidateIngestionServer {
  app: FastifyInstance;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createServer(config: ServiceConfig, db: ServiceDatabase): Promise<CandidateIngestionServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const ports = createServicePorts(db.pool);
  const deps = createCandidateIngestionDeps(ports);
  const module = createCandidateIngestionModule(deps);
  registerRoutes(app, module);
  return {
    app,
    async start() { await app.listen({ port: config.port, host: config.host }); },
    async close() { await app.close(); },
  };
}
