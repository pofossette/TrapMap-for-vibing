import type { CandidateIngestionPort } from '@trapmap/backend-core';
import Fastify, { type FastifyInstance } from 'fastify';
import { type CandidateIngestionDeps, createCandidateIngestionServiceModule } from './deps.js';
import { registerCandidateIngestionRoutes } from './routes.js';

export interface CandidateIngestionServiceConfig {
  host: string;
  port: number;
  logLevel: string;
}

export interface CandidateIngestionServer {
  app: FastifyInstance;
  module: CandidateIngestionPort;
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createCandidateIngestionServer(
  config: CandidateIngestionServiceConfig,
  deps: CandidateIngestionDeps,
): Promise<CandidateIngestionServer> {
  const app = Fastify({ logger: { level: config.logLevel } });
  const module = createCandidateIngestionServiceModule(deps);
  registerCandidateIngestionRoutes(app, module);

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
