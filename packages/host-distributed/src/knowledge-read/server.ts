/**
 * Knowledge-read service Fastify server assembly.
 *
 * Wires together the backend-core knowledge-read module with shared
 * infrastructure (database pool, port implementations) and registers
 * the internal HTTP routes.
 */

import { createKnowledgeReadModule } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServiceConfig } from '../config/index.js';
import type { ServiceDatabase } from '../shared/database.js';
import { createServicePorts } from '../shared/ports.js';
import { createKnowledgeReadDeps } from './ports.js';
import { registerRoutes } from './routes.js';

// ---------------------------------------------------------------------------
// Server interface
// ---------------------------------------------------------------------------

export interface KnowledgeReadServer {
  app: FastifyInstance;
  start(): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<KnowledgeReadServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const ports = createServicePorts(db.pool);
  const deps = createKnowledgeReadDeps(ports);
  const module = createKnowledgeReadModule(deps);

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
