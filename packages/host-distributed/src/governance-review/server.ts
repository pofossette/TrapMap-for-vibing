import Fastify, { type FastifyInstance } from 'fastify';
import { createGovernanceReviewModule } from '@trapmap/backend-core';
import type { ServiceConfig } from '../config/index.js';
import type { ServiceDatabase } from '../shared/database.js';
import { createGovernanceReviewDeps } from './ports.js';
import { registerRoutes } from './routes.js';
import { createServicePorts } from '../shared/ports.js';

export interface GovernanceReviewServer {
  app: FastifyInstance;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createServer(config: ServiceConfig, db: ServiceDatabase): Promise<GovernanceReviewServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const ports = createServicePorts(db.pool);
  const deps = createGovernanceReviewDeps(ports);
  const module = createGovernanceReviewModule(deps);
  registerRoutes(app, module);
  return {
    app,
    async start() { await app.listen({ port: config.port, host: config.host }); },
    async close() { await app.close(); },
  };
}
