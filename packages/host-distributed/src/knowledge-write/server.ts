/**
 * Knowledge-write service Fastify server assembly.
 *
 * Wires together the backend-core module, shared port implementations,
 * and internal HTTP routes into a standalone Fastify server instance.
 */

import { createKnowledgeWriteModule } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServiceConfig } from '../config/index.js';
import type { ServiceDatabase } from '../shared/database.js';
import { createServicePorts } from '../shared/ports.js';
import { createKnowledgeWriteDeps } from './ports.js';
import { registerRoutes } from './routes.js';

// ---------------------------------------------------------------------------
// Server interface
// ---------------------------------------------------------------------------

export interface KnowledgeWriteServer {
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
): Promise<KnowledgeWriteServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const ports = createServicePorts(db.pool);
  const deps = createKnowledgeWriteDeps(ports);
  const module = createKnowledgeWriteModule(deps);

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
