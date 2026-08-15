import type { KnowledgeReadPort } from '@trapmap/backend-core';
import { createFastifyServiceServer } from '@trapmap/backend-core';
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
  return createFastifyServiceServer(config, module, createKnowledgeReadRouteDefs(module), module);
}
