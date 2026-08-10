import type { KnowledgeReadPort } from '@trapmap/backend-core';
import { createFastifyAdapter } from '@trapmap/backend-core';
import type { FastifyInstance } from 'fastify';

import { type KnowledgeReadDeps, createKnowledgeReadServiceModule } from './deps.js';
import { createKnowledgeReadRouteDefs } from './routes.js';

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
  const module = createKnowledgeReadServiceModule(deps);
  const app = createFastifyAdapter(createKnowledgeReadRouteDefs(module), module, {
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
