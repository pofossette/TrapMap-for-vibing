import type { KnowledgeReadPort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';

import { type KnowledgeReadDeps, createKnowledgeReadServiceModule } from './deps.js';
import { registerKnowledgeReadRoutes } from './routes.js';

export interface KnowledgeReadServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface KnowledgeReadServer {
  app: FastifyInstance;
  module: KnowledgeReadPort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createKnowledgeReadServer(
  config: KnowledgeReadServiceConfig,
  deps: KnowledgeReadDeps,
): Promise<KnowledgeReadServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const module = createKnowledgeReadServiceModule(deps);
  registerKnowledgeReadRoutes(app, module);

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
